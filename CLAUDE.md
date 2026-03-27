# CLAUDE.md

# fomoagent — Claude Code Configuration

## Read First

- **Start with `fomoagent/`** — read `fomoagent/README.md` for runtime overview, then `fomoagent/src/index.js` for the core intelligence modules
- Check out `tinyfish-cookbook/README.md` for TinyFish API patterns and examples
- Check out `IDEA.md` for the full product vision and five intelligence modules
- Check out `CONTEXT.md` (active task log and session handoff; update it at the end of each session)

---

## What This Project Is

fomoagent is a persistent, always-on AI agent that acts as Soumalya's personal intelligence layer for the Web3 ecosystem. Not a chatbot you open when you need it — something that runs continuously, learns over time, monitors the space on his behalf, and surfaces signal he would have missed.

The agent knows his stack (Solana, Rust, Anchor, EVM, Solidity, TypeScript), his projects (FomoFam, SprkClub, DegenCalls), and his goals. Over time it builds a connected knowledge graph of the Web3 ecosystem — opportunities, people, competitors, projects — and makes him meaningfully faster at decisions that currently take hours of manual research.

**The core outcome: spend less time searching, more time building.**

This is a **TinyFish Accelerator submission** — built on TinyFish's browser agent API for live web scraping across any site.

### Current MVP Scope

The MVP is a Web3 Event Concierge with a lightweight manual alpha monitor:

- **Event discovery** — scrape ETHGlobal, Devfolio, Dorahacks, lu.ma/web3, Solana Events, CryptoNomads in parallel
- **Alpha monitor** — manual-trigger only; event announcement deltas, registration openings, sponsor activity

---

## Five Intelligence Modules (Full Vision)

Defined in `IDEA.md`. The MVP implements Module 1 and a light version of Module 2.

### Module 1 — Opportunity Hunter (MVP Core)

Automates hackathon and grant discovery. Knows the stack, reads every prize track, cross-references existing deployments, scores by prize-to-effort ratio. Covers ETHGlobal, Devfolio, Dorahacks, Superteam, Questbook, Gitcoin, Solana Foundation grants, Base ecosystem grants.

### Module 2 — Web3 Alpha Monitor (Light in MVP)

Watches the live pulse of the ecosystem across FomoFam (event sponsors, community growth), SprkClub (creator token launches, bonding curve patterns), and DegenCalls (prediction market activity, volatility signals). Runs on cron; surfaces anomalies, not noise. Includes a Reputation Engine for due diligence on new projects.

### Module 3 — KOL and Partnership Scout (Planned)

Automated discovery of community operators, builders, and creators. Searches Twitter profiles, conference speaker lists, DAO contributor pages, community directories. Returns people with evidence — not just names. Cross-references against the Reputation Engine.

### Module 4 — Ecosystem Monitor (Planned)

Tracks named competitors weekly. For SprkClub: Pump.fun, Friend.tech successors. For DegenCalls: Polymarket, Drift prediction markets. For FomoFam: Luma, Eventbrite. Writes diffs to memory; answers "what changed in the competitive landscape this week" with real evidence.

### Module 5 — Reputation Engine (Planned, lives inside Module 2)

Full due diligence pass on any project: Twitter (account age, engagement quality), GitHub (real code vs placeholder README), official website (team transparency), on-chain (wallet history, prior rug activity). Parallel sub-agents, plain English verdict. Memory makes it compounding — a flagged wallet stays flagged permanently.

---

## Stack

- **fomoagent** — custom Node.js API-first agent runtime (`fomoagent/`)
- **TinyFish** — browser agent API (`https://agent.tinyfish.ai/v1/automation/run-sse`)
- **LLM provider** — Gemini (gemini-2.5-flash-lite default via Google Generative AI SDK)
- **Interface** — HTTP API (Express); no channel layer in core runtime
- **Scheduler** — built-in cron service with persistent job store
- **Heartbeat** — optional periodic proactive monitoring

---

## Commands

```bash
# Install dependencies
cd fomoagent && npm install

# Start the agent API server (default port 18790)
npm run dev

# Or directly
node fomoagent/src/server.js

# Override config path
FOMOAGENT_CONFIG_PATH=./config.json node fomoagent/src/server.js

# Run tests
cd fomoagent && node --test test/
```

---

## API Endpoints

```
POST /v1/chat                    ← main entry point (non-streaming)
POST /v1/chat/stream             ← SSE streaming
GET  /v1/status                  ← agent status and context usage
POST /v1/sessions/new            ← clear session, archive to memory
GET  /v1/sessions                ← list all sessions
GET  /v1/runs                    ← list background runs
POST /v1/runs/cancel             ← cancel a run by runId
GET  /v1/cron/jobs               ← list scheduled jobs
POST /v1/cron/jobs/:id/run       ← trigger a cron job immediately
POST /v1/cron/jobs/:id/enable    ← enable a cron job
POST /v1/cron/jobs/:id/disable   ← disable a cron job
GET  /v1/heartbeat/status        ← heartbeat service status
GET  /health                     ← health check
```

---

## Project File Structure

```
fomoagent/
├── src/
│   ├── server.js                  ← bootstrap: config, services, Express server
│   ├── index.js                   ← core intelligence modules (TINYFISH_EXEC, WEB3_CONCIERGE, ALPHA_MONITOR_LIGHT)
│   ├── agent/
│   │   ├── context.js             ← system prompt builder, runtime context
│   │   ├── loop.js                ← main agent processing engine
│   │   ├── memory.js              ← MEMORY.md + HISTORY.md persistence and consolidation
│   │   ├── runner.js              ← LLM tool-use loop
│   │   └── skills.js              ← lazy skill loader from workspace/skills/
│   ├── api/
│   │   └── server.js              ← Express route handlers
│   ├── config/
│   │   ├── loader.js              ← JSON config loading, env var resolution
│   │   └── schema.js              ← defaults and provider specs
│   ├── cron/
│   │   ├── service.js             ← recurring job scheduler
│   │   └── store.js               ← JSON persistence for cron jobs
│   ├── heartbeat/
│   │   └── service.js             ← periodic proactive monitoring
│   ├── providers/
│   │   ├── base.js                ← LLMProvider base class, retry logic
│   │   ├── gemini.js              ← Google Gemini provider
│   │   └── registry.js            ← provider factory from config
│   ├── security/
│   │   └── network.js             ← SSRF protection, URL validation
│   ├── session/
│   │   └── manager.js             ← JSONL session persistence
│   └── tools/
│       ├── base.js                ← Tool base class
│       ├── filesystem.js          ← read_file, write_file, edit_file, list_dir
│       ├── shell.js               ← exec tool (TinyFish curl runs through here)
│       ├── web.js                 ← web_search, web_fetch
│       ├── message.js             ← message tool (API callback)
│       ├── cron.js                ← cron tool (agent-facing)
│       ├── spawn.js               ← background task spawning
│       └── registry.js            ← tool registration and execution
├── test/
│   ├── config.test.js
│   └── cron.test.js
└── workspace/
    ├── SOUL.md                    ← Agent personality
    ├── AGENTS.md                  ← Behavioral rules
    ├── USER.md                    ← Soumalya's profile for personalization
    ├── TOOLS.md                   ← Tool usage guidelines
    ├── HEARTBEAT.md               ← Periodic monitoring tasks
    ├── memory/
    │   ├── MEMORY.md              ← Auto-updated long-term memory (do not manually overwrite)
    │   └── HISTORY.md             ← Auto-updated event log (do not manually overwrite)
    ├── skills/
    │   └── web3_alpha_monitor/
    │       └── SKILL.md           ← Web3 event + alpha monitor skill (always-loaded)
    ├── events/                    ← Scraped event results saved here
    │   └── YYYY-MM-DD-events.md
    └── alpha/                     ← Alpha signal results saved here
        └── YYYY-MM-DD-HH-signals.md
```

---

## Config Structure

Default config path: `~/.fomoagent/config.json`
Override with `FOMOAGENT_CONFIG_PATH` environment variable.

```json
{
  "providers": {
    "gemini": {
      "apiKey": "${GEMINI_API_KEY}"
    }
  },
  "agents": {
    "defaults": {
      "model": "gemini/gemini-2.5-flash-lite",
      "workspace": "~/.fomoagent/workspace",
      "maxToolIterations": 40,
      "contextWindowTokens": 65536,
      "runTimeoutSeconds": 180
    }
  },
  "gateway": {
    "host": "0.0.0.0",
    "port": 18790
  },
  "scheduler": {
    "enabled": true,
    "tickSeconds": 15
  },
  "heartbeat": {
    "enabled": false,
    "intervalMinutes": 30
  },
  "tools": {
    "exec": { "enable": true, "timeout": 60 },
    "restrictToWorkspace": false
  }
}
```

---

## Environment Variables Required

```bash
export GEMINI_API_KEY="your-gemini-key"
export TINYFISH_API_KEY="your-tinyfish-key"
```

`TINYFISH_API_KEY` is used inside TinyFish curl commands executed via the exec tool.
`GEMINI_API_KEY` is the LLM provider key — also accepted via `${GEMINI_API_KEY}` placeholder in config.json.

---

## Core Intelligence Modules (src/index.js)

These three exports are injected directly into the agent's system prompt on every request — they are not lazy-loaded skills. They define the agent's permanent capabilities:

**`TINYFISH_EXEC`** — the curl pattern for calling TinyFish's SSE streaming API. Reads until `"type": "COMPLETE"` then extracts the `result` field.

**`WEB3_CONCIERGE`** — Module 1. Event discovery across ETHGlobal, Devfolio, Dorahacks, lu.ma/web3, Eventbrite. Extraction schema per event (name, startDate, endDate, city, country, chainOrEcosystem, eventType, sourceUrl, whyRelevant, signalTags, confidence). Always returns markdown digest + strict JSON.

**`ALPHA_MONITOR_LIGHT`** — Module 2 (light). Manual-trigger only. Event announcement deltas, registration openings, sponsor activity from lu.ma/web3, ETHGlobal, Devfolio. Returns alphaSignals array in JSON.

---

## TinyFish API Pattern

```bash
curl -N -X POST https://agent.tinyfish.ai/v1/automation/run-sse \
  -H "X-API-Key: $TINYFISH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "URL", "goal": "GOAL"}' \
  2>/dev/null | while IFS= read -r line; do
    if [[ "$line" == data:* ]]; then
      json="${line#data: }"
      type=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('type',''))" 2>/dev/null)
      if [[ "$type" == "COMPLETE" ]]; then
        echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('result',''), indent=2))"
        break
      fi
    fi
  done
```

Response is an SSE stream. Read until `"type": "COMPLETE"` then extract `result` field.
**Never combine multiple sites into one TinyFish goal. Run one site per call, parallelize with spawn.**

---

## Skills System

Skills in `workspace/skills/<name>/SKILL.md` extend agent capabilities. Each skill has YAML frontmatter:

```yaml
---
name: skill-name
description: when to use this skill — specific trigger phrases and conditions
always: true # optional — if true, loaded into every system prompt automatically
---
```

The `description` is the routing signal — write it precisely. The agent reads SKILL.md on demand via `read_file` unless `always: true`, in which case it's pre-loaded into every prompt.

Current skills:

- `web3_alpha_monitor` — always-loaded; Web3 event discovery + manual alpha monitor

---

## Agent Behavioral Rules

1. **Never manually edit `memory/MEMORY.md` or `memory/HISTORY.md`** — auto-managed by the memory consolidator
2. **HEARTBEAT.md** — add tasks here for periodic monitoring (runs on configured interval)
3. **Always return digest + JSON** — both sections required for every module output
4. **Parallel scraping** — use spawn tool when sources are independent; never serialize avoidable sequential calls
5. **Save outputs** — event sweeps to `workspace/events/`, alpha signals to `workspace/alpha/`
6. **Memory is persistent** — MEMORY.md survives server restarts; session state is JSONL in `workspace/sessions/`
7. **Alpha monitor is manual-only** — do not schedule or auto-trigger; only runs on explicit user request

---

## Three Demo Scenarios (for testing)

**Demo 1 — Event Discovery (Attendee):**

```
Find Web3 hackathons in India happening in the next 2 months
```

**Demo 2 — Grant Discovery (Organizer):**

```
I'm organizing a DeFi event in Bangalore in July. Find grants and accelerators I can apply to for funding
```

**Demo 3 — Sponsor Matching:**

```
I represent a DeFi protocol. Find Web3 events next month focused on DeFi trading
```

Expected: Real results from live websites in under 60 seconds each.

---

## Pre-Demo Checklist

- [ ] `npm run dev` running without errors on port 18790
- [ ] `$GEMINI_API_KEY` and `$TINYFISH_API_KEY` exported in shell
- [ ] `GET /health` returns `{ ok: true }`
- [ ] At least one TinyFish exec test completed successfully
- [ ] `workspace/events/` and `workspace/alpha/` directories exist
- [ ] `HEARTBEAT.md` has at least one monitoring task
- [ ] `workspace/skills/web3_alpha_monitor/SKILL.md` present

---

## VPS Deployment — Docker Setup

### Folder Structure on VPS

```
~/fomoagent/
├── .env                          ← API keys — NEVER commit this
├── .gitignore                    ← must include .env
├── docker-compose.yml
├── config.json                   ← uses ${VAR} placeholders, no hardcoded keys
└── workspace/
    ├── SOUL.md
    ├── AGENTS.md
    ├── USER.md
    ├── HEARTBEAT.md
    ├── skills/
    │   └── web3_alpha_monitor/
    │       └── SKILL.md
    ├── events/
    └── alpha/
```

### .env File

```bash
GEMINI_API_KEY=your-gemini-key-here
TINYFISH_API_KEY=your-tinyfish-key-here
```

Add `.env` to `.gitignore` immediately.

### docker-compose.yml

```yaml
version: "3.9"

services:
  fomoagent:
    image: node:22-slim
    container_name: fomoagent
    restart: unless-stopped
    working_dir: /app
    volumes:
      - .:/app
      - ./workspace:/app/fomoagent/workspace
    env_file:
      - .env
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - TINYFISH_API_KEY=${TINYFISH_API_KEY}
      - FOMOAGENT_CONFIG_PATH=/app/config.json
      - PORT=18790
    ports:
      - "18790:18790"
    command: >
      bash -c "cd fomoagent && npm install --quiet && node src/server.js"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:18790/health"]
      interval: 60s
      timeout: 10s
      retries: 3
```

### Daily VPS Management Commands

```bash
# Watch live logs
docker compose logs -f

# Restart after config or skill file changes
docker compose restart

# Shell inside container
docker compose exec fomoagent bash

# Verify env vars loaded
docker compose exec fomoagent env | grep -E "GEMINI|TINYFISH"

# Test TinyFish from inside container
docker compose exec fomoagent bash -c '
  curl -s -X POST https://agent.tinyfish.ai/v1/automation/run-sse \
    -H "X-API-Key: $TINYFISH_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"https://ethglobal.com/events\", \"goal\": \"List all events\"}"
'

# Full rebuild after major changes
docker compose down && docker compose up -d

# Auto-start on VPS reboot
sudo systemctl enable docker
```

### Persistence

| Data           | Location                     | Survives restarts? |
| -------------- | ---------------------------- | ------------------ |
| MEMORY.md      | `./workspace/memory/`        | ✅ Yes             |
| HISTORY.md     | `./workspace/memory/`        | ✅ Yes             |
| Sessions       | `./workspace/sessions/`      | ✅ Yes             |
| Cron jobs      | `./workspace/cron/jobs.json` | ✅ Yes             |
| Scraped events | `./workspace/events/`        | ✅ Yes             |
| Alpha signals  | `./workspace/alpha/`         | ✅ Yes             |
| Skills         | `./workspace/skills/`        | ✅ Yes             |
| Config         | `./config.json`              | ✅ Yes             |

---

## Troubleshooting

**Server not starting:**

```bash
node --version   # must be 18+
cd fomoagent && npm install
GEMINI_API_KEY=xxx node src/server.js
```

**TinyFish returns empty:**

```bash
echo $TINYFISH_API_KEY
curl -X POST https://agent.tinyfish.ai/v1/automation/run-sse \
  -H "X-API-Key: $TINYFISH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://ethglobal.com/events", "goal": "List all events"}'
```

**Gemini 429 rate limit:**
The retry config uses longer backoffs (`[8000, 20000, 60000]ms`) — intentional for Gemini's free tier. Wait and retry. Enable billing in Google Cloud if persistent.

**Skill not being used by agent:**

- Check frontmatter `description` is specific enough
- Check skill directory name matches `name` in frontmatter
- For always-loaded skills, verify `always: true` in frontmatter
- Try explicitly: "Use the web3 alpha monitor skill to find events"

**Memory getting too large:**
The memory consolidator triggers automatically when context window usage exceeds budget. Runs in background after each turn. Force a new session via `POST /v1/sessions/new`.

---

## What NOT to Do

- Do not add a channel layer (Telegram/Slack/Discord) to the core runtime — the API-first design is intentional
- Do not hardcode API keys in config.json — use `${VAR}` placeholders
- Do not manually overwrite MEMORY.md or HISTORY.md — let the consolidator manage them
- Do not combine multiple websites into a single TinyFish goal — one site per call
- Do not auto-schedule the alpha monitor — manual trigger only in the current MVP
- Do not commit `.env` — it contains API keys

---

## Future Directions

### RAG Implementation

As memory accumulates, a vector store replaces flat MEMORY.md. All accumulated intelligence becomes queryable at inference time — the system gets smarter the longer it runs, rather than just larger.

### Multi-Agent Architecture

Dedicated specialist agents running permanently: one that only watches on-chain activity, one that only tracks KOLs, one that only scores new projects. A coordinator agent aggregates signal and handles user interaction. Each specialist maintains its own focused memory and publishes findings to a shared intelligence layer.

### Obsidian Integration

Point the workspace directly at an Obsidian vault. Every event scraped, grant discovered, and conversation becomes a linked, searchable note automatically. One config change:

```json
{
  "agents": {
    "defaults": {
      "workspace": "/path/to/ObsidianVault/fomoagent"
    }
  }
}
```
