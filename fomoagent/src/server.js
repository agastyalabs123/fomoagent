/**
 * Server bootstrap — loads config, builds all services, starts Express API.
 * Entry point: node fomoagent/src/server.js
 */

import 'dotenv/config';
import { loadConfig, validateConfig, getWorkspacePath, setConfigPath } from './config/loader.js';
import { createProvider } from './providers/registry.js';
import { AgentLoop } from './agent/loop.js';
import { CronService } from './cron/service.js';
import { HeartbeatService } from './heartbeat/service.js';
import { createApiServer } from './api/server.js';

// ── Config ───────────────────────────────────────────────────────────────────

const configPath = process.env.FOMOAGENT_CONFIG_PATH || null;
if (configPath) setConfigPath(configPath);

const config = loadConfig(configPath);
validateConfig(config);

const agentDefaults = config.agents.defaults;
const workspace = getWorkspacePath(agentDefaults.workspace);

// ── Provider ─────────────────────────────────────────────────────────────────

const provider = createProvider(config);

// ── Late-binding runner ref (resolves cron/heartbeat <-> agentLoop cycle) ────

let agentLoop;
const runMessage = (sessionId, message) => agentLoop.process({ sessionId, message });

// ── Cron ─────────────────────────────────────────────────────────────────────

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

let heartbeatService = null;
if (config.heartbeat?.enabled) {
  heartbeatService = new HeartbeatService({
    workspace,
    intervalMinutes: config.heartbeat.intervalMinutes ?? 30,
    maxRunsPerHour: config.heartbeat.maxRunsPerHour ?? 4,
    prompt: config.heartbeat.prompt,
    onRun: (job) => runMessage(job.sessionId || 'heartbeat:auto', job.message),
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
});

// ── Start services ────────────────────────────────────────────────────────────

if (cronService) cronService.start();
if (heartbeatService) heartbeatService.start();

// ── HTTP API ──────────────────────────────────────────────────────────────────

const app = createApiServer({ agentLoop });

const host = config.gateway?.host ?? '0.0.0.0';
const port = Number(process.env.PORT || config.gateway?.port || 18790);

app.listen(port, host, () => {
  console.log(`fomoagent API listening on http://${host}:${port}`);
  console.log(`workspace: ${workspace}`);
  console.log(`model:     ${agentDefaults.model}`);
  if (cronService) console.log('cron:      enabled');
  if (heartbeatService) console.log('heartbeat: enabled');
});
