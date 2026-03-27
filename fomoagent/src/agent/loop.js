/**
 * Agent loop — the core processing engine.
 * API-only (no channels, no bus).
 *
 * Changes from previous version:
 *   1. Accepts dataStore and registers DbTool so agent can query/cache scrape results.
 *   2. Calls heartbeatService.maybeRunIfDue() at the start of each message —
 *      heartbeat is now message-triggered instead of timer-triggered.
 */

import { ContextBuilder } from "./context.js";
import { MemoryConsolidator } from "./memory.js";
import { AgentRunner } from "./runner.js";
import { ToolRegistry } from "../tools/registry.js";
import {
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  ListDirTool,
} from "../tools/filesystem.js";
import { ExecTool } from "../tools/shell.js";
import { WebSearchTool, WebFetchTool } from "../tools/web.js";
import { MessageTool } from "../tools/message.js";
import { CronTool } from "../tools/cron.js";
import { SpawnTool } from "../tools/spawn.js";
import { DbTool } from "../tools/db.js";
import { SessionManager } from "../session/manager.js";

export class AgentLoop {
  constructor({
    provider,
    workspace,
    model,
    maxIterations = 40,
    contextWindowTokens = 65_536,
    webSearchConfig,
    execConfig,
    restrictToWorkspace = false,
    timezone,
    cronService = null,
    heartbeatService = null,
    dataStore = null,
    runTimeoutSeconds = 180,
    maxConcurrentRuns = 8,
  }) {
    this.provider = provider;
    this.workspace = workspace;
    this.model = model || provider.getDefaultModel();
    this.maxIterations = maxIterations;
    this.contextWindowTokens = contextWindowTokens;
    this.restrictToWorkspace = restrictToWorkspace;
    this.runTimeoutMs = Math.max(
      10_000,
      Number(runTimeoutSeconds || 180) * 1000,
    );
    this.maxConcurrentRuns = Math.max(1, Number(maxConcurrentRuns || 8));
    this.cronService = cronService;
    this.heartbeatService = heartbeatService;
    this.dataStore = dataStore;

    this.context = new ContextBuilder(workspace, { timezone });
    this.sessions = new SessionManager(workspace);
    this.tools = new ToolRegistry();
    this.runner = new AgentRunner(provider);

    this._lastUsage = {};
    this._startTime = Date.now();
    this._activeRuns = new Map();
    this._bgRuns = new Map();

    this._registerTools({ webSearchConfig, execConfig });

    this.memoryConsolidator = new MemoryConsolidator({
      workspace,
      provider,
      model: this.model,
      sessions: this.sessions,
      contextWindowTokens,
      buildMessages: (opts) => this.context.buildMessages(opts),
      getToolDefinitions: () => this.tools.getDefinitions(),
      maxCompletionTokens: provider.generation?.maxTokens || 4096,
    });
  }

  _registerTools({ webSearchConfig, execConfig } = {}) {
    const allowedDir = this.restrictToWorkspace ? this.workspace : null;
    const toolOpts = { workspace: this.workspace, allowedDir };

    this.tools.register(new ReadFileTool(toolOpts));
    this.tools.register(new WriteFileTool(toolOpts));
    this.tools.register(new EditFileTool(toolOpts));
    this.tools.register(new ListDirTool(toolOpts));

    if (!execConfig || execConfig.enable !== false) {
      this.tools.register(
        new ExecTool({
          workingDir: this.workspace,
          timeout: execConfig?.timeout || 60,
          restrictToWorkspace: this.restrictToWorkspace,
          pathAppend: execConfig?.pathAppend || "",
        }),
      );
    }

    this.tools.register(new WebSearchTool({ config: webSearchConfig }));
    this.tools.register(new WebFetchTool());
    this.tools.register(new MessageTool());

    if (this.cronService) {
      this.tools.register(new CronTool({ cronService: this.cronService }));
    }

    // DB tool — only registered if dataStore was provided
    if (this.dataStore) {
      this.tools.register(new DbTool({ dataStore: this.dataStore }));
    }

    this.tools.register(
      new SpawnTool({
        runInBackground: (payload) => this.startBackgroundRun(payload),
        listRuns: () => this.listBackgroundRuns(),
      }),
    );
  }

  /**
   * Process a message and return the response.
   * This is the main API entry point.
   */
  async process({
    sessionId = "api:default",
    message,
    streaming = false,
    onStream,
    onStreamEnd,
    onProgress,
  }) {
    if (this._activeRuns.size >= this.maxConcurrentRuns) {
      throw new Error("Too many concurrent runs. Try again shortly.");
    }

    const runId = `${sessionId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    this._activeRuns.set(runId, {
      sessionId,
      startedAt: new Date().toISOString(),
      cancelled: false,
    });
    const session = this.sessions.getOrCreate(sessionId);

    const timeout = setTimeout(() => {
      const run = this._activeRuns.get(runId);
      if (run) run.cancelled = true;
    }, this.runTimeoutMs);

    try {
      // ── Heartbeat check — runs before agent processes the message ──────────
      // No timer needed: this fires on every incoming message, respects interval
      // and rate limit internally, skips silently if nothing is due.
      if (this.heartbeatService) {
        await this.heartbeatService.maybeRunIfDue();
      }

      // ── Memory consolidation ───────────────────────────────────────────────
      await this.memoryConsolidator.maybeConsolidateByTokens(session);

      // ── Message tool setup ─────────────────────────────────────────────────
      const msgTool = this.tools.get("message");
      if (msgTool) msgTool.startTurn();

      // ── Build messages with full context ───────────────────────────────────
      const history = session.getHistory(0);
      const [channel, chatId] = sessionId.includes(":")
        ? sessionId.split(":", 2)
        : ["api", sessionId];

      const initialMessages = this.context.buildMessages({
        history,
        currentMessage: message,
        channel,
        chatId,
      });

      // ── Run agent loop ─────────────────────────────────────────────────────
      const result = await this.runner.run({
        messages: initialMessages,
        tools: this.tools,
        model: this.model,
        maxIterations: this.maxIterations,
        streaming,
        shouldCancel: () => this._activeRuns.get(runId)?.cancelled === true,
        hooks: {
          onStream,
          onStreamEnd,
          onToolHint: onProgress,
          onProgress,
        },
      });

      this._lastUsage = result.usage;

      const finalContent =
        result.finalContent ||
        "I've completed processing but have no response to give.";

      this._saveTurn(session, result.messages, 1 + history.length);
      this.sessions.save(session);

      // Background consolidation
      this.memoryConsolidator
        .maybeConsolidateByTokens(session)
        .catch((e) =>
          console.warn("Background consolidation error:", e.message),
        );

      return {
        sessionId,
        runId,
        reply: finalContent,
        usage: result.usage,
        toolsUsed: result.toolsUsed,
        stopReason: result.stopReason,
      };
    } finally {
      clearTimeout(timeout);
      this._activeRuns.delete(runId);
    }
  }

  _saveTurn(session, messages, skip) {
    const TOOL_MAX = 16_000;
    for (const m of messages.slice(skip)) {
      const entry = { ...m };
      const { role, content } = entry;

      if (role === "assistant" && !content && !entry.tool_calls) continue;

      if (
        role === "tool" &&
        typeof content === "string" &&
        content.length > TOOL_MAX
      ) {
        entry.content = content.slice(0, TOOL_MAX) + "\n... (truncated)";
      }

      if (
        role === "user" &&
        typeof content === "string" &&
        content.startsWith(ContextBuilder.RUNTIME_CONTEXT_TAG)
      ) {
        const parts = content.split("\n\n", 2);
        if (parts.length > 1 && parts[1].trim()) {
          entry.content = parts[1];
        } else {
          continue;
        }
      }

      entry.timestamp = entry.timestamp || new Date().toISOString();
      session.messages.push(entry);
    }
    session.updatedAt = new Date();
  }

  getStatus(sessionId) {
    const session = sessionId ? this.sessions.getOrCreate(sessionId) : null;
    const historyLen = session ? session.getHistory(0).length : 0;
    let ctxEst = 0;
    try {
      if (session)
        ctxEst = this.memoryConsolidator.estimateSessionPromptTokens(session);
    } catch {
      /* ignore */
    }

    const uptimeMs = Date.now() - this._startTime;
    const uptimeMin = Math.floor(uptimeMs / 60_000);
    const uptimeH = Math.floor(uptimeMin / 60);

    const dbStats = this.dataStore ? this.dataStore.stats() : null;

    return {
      version: "0.1.0",
      model: this.model,
      uptime: uptimeH > 0 ? `${uptimeH}h ${uptimeMin % 60}m` : `${uptimeMin}m`,
      lastUsage: this._lastUsage,
      contextWindow: this.contextWindowTokens,
      contextUsed: ctxEst,
      sessionMessages: historyLen,
      activeRuns: this._activeRuns.size,
      backgroundRuns: this._bgRuns.size,
      db: dbStats,
      heartbeat: this.heartbeatService?.getStatus() ?? null,
    };
  }

  async newSession(sessionId) {
    const session = this.sessions.getOrCreate(sessionId);
    const snapshot = session.messages.slice(session.lastConsolidated);
    session.clear();
    this.sessions.save(session);
    this.sessions.invalidate(sessionId);

    if (snapshot.length) {
      this.memoryConsolidator.store
        .consolidate(snapshot, this.provider, this.model)
        .catch((e) => console.warn("Archive on /new failed:", e.message));
    }

    return { message: "New session started." };
  }

  async startBackgroundRun({
    sessionId = "api:default",
    message,
    source = "api",
  }) {
    const runId = `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this._bgRuns.set(runId, {
      runId,
      sessionId,
      source,
      status: "running",
      startedAt: new Date().toISOString(),
      messagePreview: String(message || "").slice(0, 120),
    });

    this.process({ sessionId, message })
      .then((result) => {
        const run = this._bgRuns.get(runId);
        if (!run) return;
        run.status = "completed";
        run.finishedAt = new Date().toISOString();
        run.stopReason = result.stopReason;
      })
      .catch((e) => {
        const run = this._bgRuns.get(runId);
        if (!run) return;
        run.status = "failed";
        run.finishedAt = new Date().toISOString();
        run.error = e.message;
      });

    return { runId, status: "running" };
  }

  listBackgroundRuns() {
    return [...this._bgRuns.values()].sort((a, b) =>
      (b.startedAt || "").localeCompare(a.startedAt || ""),
    );
  }

  cancelRun(runId) {
    const run = this._activeRuns.get(runId);
    if (!run) return { ok: false, message: "Run not found" };
    run.cancelled = true;
    return { ok: true, message: `Cancellation requested for ${runId}` };
  }
}
