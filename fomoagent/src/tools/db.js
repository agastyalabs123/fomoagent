/**
 * DB tool — gives the agent access to the SQLite data layer.
 *
 * Actions:
 *   cache_lookup  — check if a URL+goal was scraped recently (avoid redundant TinyFish calls)
 *   cache_store   — persist a TinyFish result after a fresh scrape
 *   events_query  — query stored structured events with filters
 *   events_upsert — bulk-write extracted events into the events table
 *   db_stats      — row counts for both tables
 */

import { Tool } from "./base.js";

export class DbTool extends Tool {
  constructor({ dataStore }) {
    super();
    this._db = dataStore;
  }

  get name() {
    return "db";
  }

  get description() {
    return [
      "Access the local SQLite data store.",
      "Use cache_lookup BEFORE every TinyFish scrape — if fresh data exists, skip the scrape entirely.",
      "Use cache_store AFTER a successful TinyFish scrape to persist results.",
      "Use events_upsert after extracting structured events from a scrape result.",
      "Use events_query to answer questions about past scrape results without re-scraping.",
    ].join(" ");
  }

  get parameters() {
    return {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "cache_lookup",
            "cache_store",
            "events_query",
            "events_upsert",
            "db_stats",
          ],
        },

        // cache_lookup / cache_store
        url: {
          type: "string",
          description:
            "The URL that was scraped (for cache_lookup and cache_store)",
        },
        goal: {
          type: "string",
          description:
            "The TinyFish goal string (for cache_lookup and cache_store)",
        },
        result: {
          type: "string",
          description: "Raw TinyFish result JSON string (for cache_store)",
        },
        ttl_hours: {
          type: "number",
          description:
            "How many hours to keep this cache entry fresh (default 6)",
        },
        max_age_hours: {
          type: "number",
          description:
            "How old a cache hit is still considered fresh (default 6, for cache_lookup)",
        },

        // events_query filters
        chain: {
          type: "string",
          description:
            'Filter by chain/ecosystem (partial match, e.g. "Solana", "EVM", "Base")',
        },
        event_type: {
          type: "string",
          description:
            "Filter by event type: hackathon | conference | meetup | online",
        },
        country: {
          type: "string",
          description: "Filter by country (partial match)",
        },
        keyword: {
          type: "string",
          description: "Keyword search across name and whyRelevant fields",
        },
        days_ahead: {
          type: "number",
          description:
            "Only return events starting within N days from today (default 90)",
        },
        limit: {
          type: "number",
          description: "Max events to return (default 50)",
        },

        // events_upsert
        events: {
          type: "string",
          description:
            'JSON array of event objects to upsert. Each must have at minimum a "name" field.',
        },
      },
      required: ["action"],
    };
  }

  async execute({
    action,
    url,
    goal,
    result,
    ttl_hours,
    max_age_hours,
    chain,
    event_type,
    country,
    keyword,
    days_ahead,
    limit,
    events,
  }) {
    if (!this._db) return "Error: data store not initialised";

    switch (action) {
      case "cache_lookup": {
        if (!url || !goal) return "Error: cache_lookup requires url and goal";
        const hit = this._db.getCached(url, goal, max_age_hours ?? 6);
        if (!hit)
          return JSON.stringify({
            hit: false,
            message: "No fresh cache entry — proceed with TinyFish scrape.",
          });
        return JSON.stringify({ hit: true, result: hit });
      }

      case "cache_store": {
        if (!url || !goal || !result)
          return "Error: cache_store requires url, goal, and result";
        this._db.setCached(url, goal, result, ttl_hours ?? 6);
        return JSON.stringify({
          ok: true,
          message: `Cached result for ${url}`,
        });
      }

      case "events_query": {
        const rows = this._db.queryEvents({
          chain,
          eventType: event_type,
          country,
          keyword,
          daysAhead: days_ahead ?? 90,
          limit: limit ?? 50,
        });
        if (!rows.length)
          return JSON.stringify({
            count: 0,
            events: [],
            message:
              "No stored events matched — consider running a fresh TinyFish scrape.",
          });
        return JSON.stringify({ count: rows.length, events: rows });
      }

      case "events_upsert": {
        if (!events)
          return "Error: events_upsert requires an events JSON array string";
        let parsed;
        try {
          parsed = typeof events === "string" ? JSON.parse(events) : events;
        } catch (e) {
          return `Error: events is not valid JSON — ${e.message}`;
        }
        if (!Array.isArray(parsed)) return "Error: events must be a JSON array";
        const count = this._db.upsertEvents(parsed);
        return JSON.stringify({ ok: true, upserted: count });
      }

      case "db_stats": {
        return JSON.stringify(this._db.stats());
      }

      default:
        return `Error: unknown action "${action}"`;
    }
  }
}
