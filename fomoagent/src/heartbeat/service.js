/**
 * HeartbeatService — message-triggered proactive checks.
 *
 * Old design: setInterval fires every N minutes regardless of activity.
 * New design: maybeRunIfDue() is called at the start of each incoming message.
 *   - Zero idle resource usage when nobody is talking to the agent.
 *   - Still respects the interval and maxRunsPerHour rate limit.
 *   - Heartbeat runs feel "proactive" because they execute before the user's
 *     response is returned — the agent checks what's due, acts, then answers.
 */

import fs from "node:fs";
import path from "node:path";

export class HeartbeatService {
  constructor({
    workspace,
    intervalMinutes = 30,
    maxRunsPerHour = 4,
    prompt = "",
    onRun,
  }) {
    this.workspace = workspace;
    this.intervalMs = Math.max(1, Number(intervalMinutes || 30)) * 60_000;
    this.maxRunsPerHour = Math.max(1, Number(maxRunsPerHour || 4));
    this.prompt = prompt;
    this.onRun = onRun;
    this.runs = [];
    this.lastDecision = null;
    this._running = false;
  }

  /**
   * Call this at the start of every incoming message.
   * Runs the heartbeat task if the interval has elapsed and rate limit allows.
   * Non-blocking — awaited before agent loop starts so results land in memory
   * before the agent builds its response.
   */
  async maybeRunIfDue() {
    if (this._running) return; // prevent overlap

    const hbPath = path.join(this.workspace, "HEARTBEAT.md");
    if (!fs.existsSync(hbPath)) {
      this.lastDecision = {
        at: new Date().toISOString(),
        decision: "skip",
        reason: "HEARTBEAT.md missing",
      };
      return;
    }

    const content = fs.readFileSync(hbPath, "utf-8").trim();
    if (!content) {
      this.lastDecision = {
        at: new Date().toISOString(),
        decision: "skip",
        reason: "HEARTBEAT.md empty",
      };
      return;
    }

    // Check interval — only run if enough time has passed since the last run
    const lastRunAt = this.runs[0] ? new Date(this.runs[0].at).getTime() : 0;
    if (Date.now() - lastRunAt < this.intervalMs) {
      this.lastDecision = {
        at: new Date().toISOString(),
        decision: "skip",
        reason: "interval not elapsed",
      };
      return;
    }

    // Rate limit — max N runs in the last hour
    const oneHourAgo = Date.now() - 3_600_000;
    const recentRuns = this.runs.filter(
      (r) => new Date(r.at).getTime() >= oneHourAgo,
    );
    if (recentRuns.length >= this.maxRunsPerHour) {
      this.lastDecision = {
        at: new Date().toISOString(),
        decision: "skip",
        reason: "rate-limited",
      };
      return;
    }

    this._running = true;
    this.lastDecision = {
      at: new Date().toISOString(),
      decision: "run",
      reason: "due",
    };

    try {
      const message = `${this.prompt}\n\nHEARTBEAT.md:\n${content}`;
      const result = await this.onRun({
        sessionId: "api:heartbeat",
        message,
        source: "heartbeat",
      });
      this.runs.unshift({
        at: new Date().toISOString(),
        ok: true,
        stopReason: result?.stopReason || "completed",
      });
    } catch (e) {
      this.runs.unshift({
        at: new Date().toISOString(),
        ok: false,
        error: e.message,
      });
    } finally {
      this.runs = this.runs.slice(0, 100);
      this._running = false;
    }
  }

  getStatus() {
    const lastRunAt = this.runs[0]?.at ?? null;
    const nextDueAt = lastRunAt
      ? new Date(new Date(lastRunAt).getTime() + this.intervalMs).toISOString()
      : "now";

    return {
      mode: "message-triggered",
      intervalMs: this.intervalMs,
      lastDecision: this.lastDecision,
      lastRunAt,
      nextDueAt,
      recentRuns: this.runs.slice(0, 20),
    };
  }
}
