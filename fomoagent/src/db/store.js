/**
 * DataStore — SQLite-backed storage for TinyFish scrape cache and structured events.
 *
 * Two concerns:
 *   1. scrape_cache  — raw TinyFish results keyed by (url, goal) with TTL
 *   2. events        — structured event rows extracted from scrape results
 *
 * Uses better-sqlite3 (synchronous) — fits Node.js single-thread model perfectly.
 * No ORM, no migrations framework. Schema is simple enough to own directly.
 */

import Database from "better-sqlite3";
import path from "node:path";
import { ensureDir } from "../utils/helpers.js";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS scrape_cache (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    url         TEXT    NOT NULL,
    goal        TEXT    NOT NULL,
    result_json TEXT    NOT NULL,
    scraped_at  INTEGER NOT NULL,
    ttl_hours   REAL    NOT NULL DEFAULT 6,
    UNIQUE(url, goal)
  );

  CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    start_date   TEXT,
    end_date     TEXT,
    city         TEXT,
    country      TEXT,
    chain        TEXT,
    event_type   TEXT,
    source_url   TEXT,
    why_relevant TEXT,
    signal_tags  TEXT,
    confidence   TEXT,
    scraped_at   INTEGER NOT NULL,
    UNIQUE(name, start_date, source_url)
  );

  CREATE INDEX IF NOT EXISTS idx_cache_url_goal  ON scrape_cache(url, goal);
  CREATE INDEX IF NOT EXISTS idx_cache_scraped_at ON scrape_cache(scraped_at);
  CREATE INDEX IF NOT EXISTS idx_events_start    ON events(start_date);
  CREATE INDEX IF NOT EXISTS idx_events_chain    ON events(chain);
  CREATE INDEX IF NOT EXISTS idx_events_scraped  ON events(scraped_at);
`;

export class DataStore {
  constructor(workspace) {
    const dir = ensureDir(path.join(workspace, "db"));
    this.db = new Database(path.join(dir, "fomoagent.db"));
    this.db.pragma("journal_mode = WAL"); // better concurrent read performance
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA);
    this._prepareStatements();
  }

  _prepareStatements() {
    this._stmts = {
      getCached: this.db.prepare(
        "SELECT result_json, scraped_at FROM scrape_cache WHERE url = ? AND goal = ? AND scraped_at > ?",
      ),
      setCached: this.db.prepare(`
        INSERT INTO scrape_cache (url, goal, result_json, scraped_at, ttl_hours)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(url, goal) DO UPDATE SET
          result_json = excluded.result_json,
          scraped_at  = excluded.scraped_at,
          ttl_hours   = excluded.ttl_hours
      `),
      upsertEvent: this.db.prepare(`
        INSERT INTO events
          (name, start_date, end_date, city, country, chain, event_type, source_url, why_relevant, signal_tags, confidence, scraped_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name, start_date, source_url) DO UPDATE SET
          end_date     = excluded.end_date,
          city         = excluded.city,
          country      = excluded.country,
          chain        = excluded.chain,
          event_type   = excluded.event_type,
          why_relevant = excluded.why_relevant,
          signal_tags  = excluded.signal_tags,
          confidence   = excluded.confidence,
          scraped_at   = excluded.scraped_at
      `),
      deleteExpired: this.db.prepare(
        "DELETE FROM scrape_cache WHERE scraped_at < ?",
      ),
    };
  }

  // ── Scrape cache ──────────────────────────────────────────────────────────

  /**
   * Returns cached result JSON if fresh, null if missing or expired.
   * @param {string} url
   * @param {string} goal
   * @param {number} maxAgeHours - default 6
   */
  getCached(url, goal, maxAgeHours = 6) {
    const cutoff = Date.now() - maxAgeHours * 3_600_000;
    const row = this._stmts.getCached.get(url, goal, cutoff);
    if (!row) return null;
    try {
      return JSON.parse(row.result_json);
    } catch {
      return null;
    }
  }

  /**
   * Store a raw TinyFish result. Overwrites if (url, goal) already exists.
   * @param {string} url
   * @param {string} goal
   * @param {string|object} result
   * @param {number} ttlHours
   */
  setCached(url, goal, result, ttlHours = 6) {
    const json = typeof result === "string" ? result : JSON.stringify(result);
    this._stmts.setCached.run(url, goal, json, Date.now(), ttlHours);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  /**
   * Upsert a single event row. Keyed on (name, start_date, source_url).
   */
  upsertEvent(event) {
    const tags = Array.isArray(event.signalTags)
      ? JSON.stringify(event.signalTags)
      : (event.signal_tags ?? null);

    this._stmts.upsertEvent.run(
      event.name ?? "Unknown",
      event.startDate ?? event.start_date ?? null,
      event.endDate ?? event.end_date ?? null,
      event.city ?? null,
      event.country ?? null,
      event.chainOrEcosystem ?? event.chain ?? null,
      event.eventType ?? event.event_type ?? null,
      event.sourceUrl ?? event.source_url ?? null,
      event.whyRelevant ?? event.why_relevant ?? null,
      tags,
      event.confidence ?? null,
      Date.now(),
    );
  }

  /**
   * Bulk upsert events inside a single transaction.
   * @param {object[]} events
   * @returns {number} count inserted/updated
   */
  upsertEvents(events) {
    if (!events?.length) return 0;
    const tx = this.db.transaction((evts) => {
      for (const e of evts) this.upsertEvent(e);
    });
    tx(events);
    return events.length;
  }

  /**
   * Query stored events with optional filters.
   * Only returns events scraped within the last 7 days by default.
   *
   * @param {object} opts
   * @param {string} [opts.chain]       - partial match on chain/ecosystem
   * @param {string} [opts.eventType]   - exact match: hackathon|conference|meetup|online
   * @param {string} [opts.country]     - partial match on country
   * @param {string} [opts.keyword]     - partial match on name or why_relevant
   * @param {number} [opts.daysAhead]   - only events starting within N days (default 90)
   * @param {number} [opts.staleDays]   - ignore events scraped more than N days ago (default 7)
   * @param {number} [opts.limit]       - max rows (default 50)
   */
  queryEvents({
    chain,
    eventType,
    country,
    keyword,
    daysAhead = 90,
    staleDays = 7,
    limit = 50,
  } = {}) {
    const staleMs = Date.now() - staleDays * 24 * 3_600_000;
    const futureCutoff = new Date(Date.now() + daysAhead * 24 * 3_600_000)
      .toISOString()
      .slice(0, 10);

    const conditions = [
      "scraped_at > ?",
      "(start_date IS NULL OR start_date <= ?)",
    ];
    const params = [staleMs, futureCutoff];

    if (chain) {
      conditions.push("chain LIKE ?");
      params.push(`%${chain}%`);
    }
    if (eventType) {
      conditions.push("event_type = ?");
      params.push(eventType);
    }
    if (country) {
      conditions.push("country LIKE ?");
      params.push(`%${country}%`);
    }
    if (keyword) {
      conditions.push("(name LIKE ? OR why_relevant LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const sql = `
      SELECT * FROM events
      WHERE ${conditions.join(" AND ")}
      ORDER BY start_date ASC
      LIMIT ?
    `;
    params.push(limit);

    return this.db
      .prepare(sql)
      .all(...params)
      .map((r) => ({
        ...r,
        chainOrEcosystem: r.chain,
        startDate: r.start_date,
        endDate: r.end_date,
        eventType: r.event_type,
        sourceUrl: r.source_url,
        whyRelevant: r.why_relevant,
        signalTags: r.signal_tags ? JSON.parse(r.signal_tags) : [],
      }));
  }

  // ── Maintenance ───────────────────────────────────────────────────────────

  /** Remove expired cache entries. Call periodically. */
  pruneCache() {
    const cutoff = Date.now() - 30 * 24 * 3_600_000; // 30 days hard limit
    const info = this._stmts.deleteExpired.run(cutoff);
    return info.changes;
  }

  stats() {
    return {
      cacheRows: this.db.prepare("SELECT COUNT(*) as n FROM scrape_cache").get()
        .n,
      eventRows: this.db.prepare("SELECT COUNT(*) as n FROM events").get().n,
    };
  }

  close() {
    this.db.close();
  }
}
