import crypto from 'node:crypto';
import { CronStore } from './store.js';

function nowIso() {
  return new Date().toISOString();
}

function nextRunAt(schedule, from = new Date()) {
  const s = String(schedule || '').trim().toLowerCase();
  const m = s.match(/^every\s+(\d+)\s*(second|seconds|minute|minutes|hour|hours)$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  const ms = unit.startsWith('second')
    ? n * 1000
    : unit.startsWith('minute')
      ? n * 60_000
      : n * 3_600_000;
  return new Date(from.getTime() + ms).toISOString();
}

export class CronService {
  constructor({ workspace, tickSeconds = 15, maxRunHistory = 100, onRunJob }) {
    this.tickSeconds = Math.max(5, Number(tickSeconds) || 15);
    this.maxRunHistory = Math.max(20, Number(maxRunHistory) || 100);
    this.onRunJob = onRunJob;
    this.store = new CronStore(workspace);
    this.jobs = this.store.load().jobs || [];
    this._timer = null;
    this._running = new Set();
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick().catch(() => {}), this.tickSeconds * 1000);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  listJobs() {
    return [...this.jobs];
  }

  addJob({ sessionId = 'api:default', prompt, schedule }) {
    if (!prompt || !schedule) throw new Error('prompt and schedule are required');
    const nextAt = nextRunAt(schedule);
    if (!nextAt) throw new Error('Unsupported schedule format. Use "every N minutes/hours/seconds".');
    const job = {
      id: crypto.randomUUID(),
      sessionId,
      prompt,
      schedule,
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      nextRunAt: nextAt,
      lastRunAt: null,
      runHistory: [],
      lastError: null,
    };
    this.jobs.push(job);
    this._persist();
    return job;
  }

  setEnabled(jobId, enabled) {
    const j = this.jobs.find((x) => x.id === jobId);
    if (!j) throw new Error(`Job not found: ${jobId}`);
    j.enabled = !!enabled;
    j.updatedAt = nowIso();
    if (j.enabled && !j.nextRunAt) j.nextRunAt = nextRunAt(j.schedule);
    this._persist();
    return j;
  }

  async runJobNow(jobId) {
    const j = this.jobs.find((x) => x.id === jobId);
    if (!j) throw new Error(`Job not found: ${jobId}`);
    await this._runSingle(j);
    return j;
  }

  async _tick() {
    const now = Date.now();
    for (const job of this.jobs) {
      if (!job.enabled || !job.nextRunAt) continue;
      if (this._running.has(job.id)) continue;
      if (new Date(job.nextRunAt).getTime() > now) continue;
      await this._runSingle(job);
    }
  }

  async _runSingle(job) {
    if (this._running.has(job.id)) return;
    this._running.add(job.id);
    const startedAt = nowIso();
    try {
      const result = await this.onRunJob({
        sessionId: job.sessionId,
        message: job.prompt,
        source: 'cron',
      });
      job.lastRunAt = startedAt;
      job.lastError = null;
      job.runHistory.unshift({
        at: startedAt,
        ok: true,
        stopReason: result?.stopReason || 'completed',
      });
    } catch (e) {
      job.lastRunAt = startedAt;
      job.lastError = e.message;
      job.runHistory.unshift({ at: startedAt, ok: false, error: e.message });
    } finally {
      job.runHistory = job.runHistory.slice(0, this.maxRunHistory);
      job.nextRunAt = nextRunAt(job.schedule, new Date());
      job.updatedAt = nowIso();
      this._running.delete(job.id);
      this._persist();
    }
  }

  _persist() {
    this.store.save({ jobs: this.jobs });
  }
}
