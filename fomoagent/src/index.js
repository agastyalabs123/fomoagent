import "dotenv/config";

import { loadConfig, getWorkspacePath, validateConfig } from "./config/loader.js";
import { createProvider } from "./providers/registry.js";
import { AgentLoop } from "./agent/loop.js";
import { createApiServer } from "./api/server.js";
import { CronService } from "./cron/service.js";
import { HeartbeatService } from "./heartbeat/service.js";

function bootstrap() {
  const configPath = process.env.FOMOAGENT_CONFIG_PATH;
  const config = loadConfig(configPath);
  validateConfig(config);
  const agentDefaults = config.agents.defaults;
  const workspace = getWorkspacePath(agentDefaults.workspace);
  const provider = createProvider(config);

  let agentLoop = null;
  const cronService =
    config.scheduler?.enabled
      ? new CronService({
        workspace,
        tickSeconds: config.scheduler.tickSeconds,
        maxRunHistory: config.scheduler.maxRunHistory,
        onRunJob: ({ sessionId, message }) => agentLoop.startBackgroundRun({ sessionId, message, source: "cron" }),
      })
      : null;

  agentLoop = new AgentLoop({
    provider,
    workspace,
    model: agentDefaults.model,
    maxIterations: agentDefaults.maxToolIterations,
    contextWindowTokens: agentDefaults.contextWindowTokens,
    webSearchConfig: config.tools.web.search,
    execConfig: config.tools.exec,
    restrictToWorkspace: !!config.tools.restrictToWorkspace,
    timezone: agentDefaults.timezone,
    runTimeoutSeconds: agentDefaults.runTimeoutSeconds,
    maxConcurrentRuns: config.runtime.maxConcurrentRuns,
    cronService,
  });

  if (cronService) cronService.start();

  const heartbeatService =
    config.heartbeat?.enabled
      ? new HeartbeatService({
        workspace,
        intervalMinutes: config.heartbeat.intervalMinutes,
        maxRunsPerHour: config.heartbeat.maxRunsPerHour,
        prompt: config.heartbeat.prompt,
        onRun: ({ sessionId, message }) => agentLoop.startBackgroundRun({ sessionId, message, source: "heartbeat" }),
      })
      : null;
  if (heartbeatService) {
    agentLoop.heartbeatService = heartbeatService;
    heartbeatService.start();
  }

  const app = createApiServer({ agentLoop });
  app.listen(config.gateway.port, config.gateway.host, () => {
    // API-only service: intentionally no channel initializers.
    console.log(
      `fomoagent API listening on http://${config.gateway.host}:${config.gateway.port}`
    );
  });
}

bootstrap();
