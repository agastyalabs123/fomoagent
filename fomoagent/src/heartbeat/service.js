import fs from 'node:fs';
import path from 'node:path';

export class HeartbeatService {
  constructor({
    workspace,
    intervalMinutes = 30,
    maxRunsPerHour = 4,
    prompt = '',
    onRun,
  }) {
    this.workspace = workspace;
    this.intervalMs = Math.max(1, Number(intervalMinutes || 30)) * 60_000;
    this.maxRunsPerHour = Math.max(1, Number(maxRunsPerHour || 4));
    this.prompt = prompt;
    this.onRun = onRun;
    this.runs = [];
    this.lastDecision = null;
    this._timer = null;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick().catch(() => {}), this.intervalMs);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  getStatus() {
    return {
      lastDecision: this.lastDecision,
      recentRuns: this.runs.slice(0, 20),
    };
  }

  async _tick() {
    const hbPath = path.join(this.workspace, 'HEARTBEAT.md');
    if (!fs.existsSync(hbPath)) {
      this.lastDecision = { at: new Date().toISOString(), decision: 'skip', reason: 'HEARTBEAT.md missing' };
      return;
    }
    const content = fs.readFileSync(hbPath, 'utf-8').trim();
    if (!content) {
      this.lastDecision = { at: new Date().toISOString(), decision: 'skip', reason: 'HEARTBEAT.md empty' };
      return;
    }
    const oneHourAgo = Date.now() - 3_600_000;
    const recent = this.runs.filter((r) => new Date(r.at).getTime() >= oneHourAgo);
    if (recent.length >= this.maxRunsPerHour) {
      this.lastDecision = { at: new Date().toISOString(), decision: 'skip', reason: 'rate-limited' };
      return;
    }
    const message = `${this.prompt}\n\nHEARTBEAT.md:\n${content}`;
    this.lastDecision = { at: new Date().toISOString(), decision: 'run', reason: 'due' };
    try {
      const result = await this.onRun({ sessionId: 'api:heartbeat', message, source: 'heartbeat' });
      this.runs.unshift({ at: new Date().toISOString(), ok: true, stopReason: result?.stopReason || 'completed' });
    } catch (e) {
      this.runs.unshift({ at: new Date().toISOString(), ok: false, error: e.message });
    }
    this.runs = this.runs.slice(0, 100);
  }
}
