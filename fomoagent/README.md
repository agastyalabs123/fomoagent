# fomoagent

API-first JavaScript agent runtime inspired by `nanobot`, with no channel layer.

## Scope

- API-only runtime (no Telegram/Slack/Discord channel framework).
- Tool-calling agent loop with sessions, memory consolidation, and skills loading.
- Scheduler, heartbeat automation, spawn/background tasks, and MCP bridge.

## Quick Start

```bash
cd fomoagent
npm install
npm run dev
```

## Main Endpoints

- `POST /v1/chat`
- `POST /v1/chat/stream`
- `GET /v1/status`
- `POST /v1/sessions/new`
- `GET /v1/runs`
- `POST /v1/runs/cancel`
- `GET /v1/cron/jobs`
- `POST /v1/cron/jobs/:id/run`
- `POST /v1/cron/jobs/:id/enable`
- `POST /v1/cron/jobs/:id/disable`
- `GET /v1/heartbeat/status`

## Config Notes

- Default config path: `~/.fomoagent/config.json`
- Override with `FOMOAGENT_CONFIG_PATH`
- Important blocks:
  - `agents.defaults` (model, tool iterations, context window, timeout)
  - `tools` (web, exec, workspace restriction)
  - `scheduler` (persistent cron service)
  - `heartbeat` (proactive periodic checks)
  - `mcp` (MCP server bridge)
  - `providers` (anthropic/openai/openrouter/azure/etc.)

## Nanobot Parity Matrix (No Channels)

- `Implemented`: core loop, tools registry, sessions, memory, skills loader, API streaming
- `Implemented`: cron tool + persistent scheduler, spawn/background runs, heartbeat automation
- `Implemented`: MCP bridge tool (HTTP MCP endpoints; stdio transport pending)
- `Implemented`: provider routing expansion (OpenAI-compatible + Anthropic + Azure path)
- `Implemented`: run cancellation, stricter config validation, expanded security guardrails
- `Not in scope`: channel abstractions, outbound delivery manager, plugin channels
