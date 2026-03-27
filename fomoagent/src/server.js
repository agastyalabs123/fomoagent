/**
 * Server bootstrap — loads config, builds all services, starts Express API.
 * Entry point: node fomoagent/src/server.js
 *
 * Changes from previous version:
 *   - DataStore (SQLite) is initialised and passed to AgentLoop.
 *   - heartbeatService is NOT started (no timer). It is passed to AgentLoop
 *     which calls maybeRunIfDue() on every incoming message instead.
 *   - cronService IS still started — its timer checks for enabled jobs only,
 *     so it's idle until the user explicitly enables a job.
 */

import "dotenv/config";
import {
  loadConfig,
  validateConfig,
  getWorkspacePath,
  setConfigPath,
} from "./config/loader.js";
import { createProvider } from "./providers/registry.js";
import { AgentLoop } from "./agent/loop.js";
import { CronService } from "./cron/service.js";
import { HeartbeatService } from "./heartbeat/service.js";
import { DataStore } from "./db/store.js";
import { createApiServer } from "./api/server.js";

// ── Config ────────────────────────────────────────────────────────────────────

const configPath = process.env.FOMOAGENT_CONFIG_PATH || null;
if (configPath) setConfigPath(configPath);

const config = loadConfig(configPath);
validateConfig(config);

const agentDefaults = config.agents.defaults;
const workspace = getWorkspacePath(agentDefaults.workspace);

// ── Provider ──────────────────────────────────────────────────────────────────

const provider = createProvider(config);

// ── Data store (SQLite) ───────────────────────────────────────────────────────

const dataStore = new DataStore(workspace);

// Prune expired cache entries on startup (non-blocking)
try {
  const pruned = dataStore.pruneCache();
  if (pruned > 0) console.log(`db: pruned ${pruned} expired cache entries`);
} catch (e) {
  console.warn("db: prune failed on startup:", e.message);
}

// ── Late-binding runner ref (resolves cron/heartbeat <-> agentLoop cycle) ─────

let agentLoop;
const runMessage = (sessionId, message) =>
  agentLoop.process({ sessionId, message });

// ── Cron ──────────────────────────────────────────────────────────────────────

let cronService = null;
if (config.scheduler?.enabled) {
  cronService = new CronService({
    workspace,
    tickSeconds: config.scheduler.tickSeconds ?? 15,
    maxRunHistory: config.scheduler.maxRunHistory ?? 100,
    onRunJob: (job) => runMessage(job.sessionId, job.message),
  });
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
// Constructed when enabled in config, but NOT started with a timer.
// AgentLoop calls maybeRunIfDue() on each incoming message instead.

let heartbeatService = null;
if (config.heartbeat?.enabled) {
  heartbeatService = new HeartbeatService({
    workspace,
    intervalMinutes: config.heartbeat.intervalMinutes ?? 30,
    maxRunsPerHour: config.heartbeat.maxRunsPerHour ?? 4,
    prompt: config.heartbeat.prompt,
    onRun: (job) => runMessage(job.sessionId || "heartbeat:auto", job.message),
  });
}

// ── Agent loop ────────────────────────────────────────────────────────────────

agentLoop = new AgentLoop({
  provider,
  workspace,
  model: agentDefaults.model,
  maxIterations: agentDefaults.maxToolIterations,
  contextWindowTokens: agentDefaults.contextWindowTokens,
  webSearchConfig: config.tools?.web?.search,
  execConfig: config.tools?.exec,
  restrictToWorkspace: config.tools?.restrictToWorkspace ?? false,
  timezone: agentDefaults.timezone,
  cronService,
  heartbeatService,
  dataStore,
});

// ── Start services ────────────────────────────────────────────────────────────

// Cron timer starts — it checks job.enabled before firing, so idle until a
// job is explicitly enabled by the user.
if (cronService) cronService.start();

// Heartbeat: intentionally NOT started here. No timer. Message-triggered only.

// ── HTTP API ──────────────────────────────────────────────────────────────────

const app = createApiServer({ agentLoop });
const host = config.gateway?.host ?? "0.0.0.0";
const port = Number(process.env.PORT || config.gateway?.port || 18790);

app.listen(port, host, () => {
  console.log(`fomoagent API listening on http://${host}:${port}`);
  console.log(`workspace: ${workspace}`);
  console.log(`model:     ${agentDefaults.model}`);
  console.log(`db:        ${workspace}/db/fomoagent.db`);
  if (cronService)
    console.log("cron:      enabled (jobs start disabled — user must enable)");
  if (heartbeatService) console.log("heartbeat: message-triggered (no timer)");
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down...`);
  if (cronService) cronService.stop();
  dataStore.close();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
