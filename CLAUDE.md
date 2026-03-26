# CLAUDE.md

# FomoFam Event Concierge — Claude Code Configuration

## Read First

- **Start with `deps/`** — read `deps/nanobot/README.md` and `deps/tinyfish/` to understand how nanobot and TinyFish work before doing anything else
- Check out `tinyfish-cookbook/README.md`
- Check out `nanobot/README.md`
- Check out `CONTEXT.md` (active task log and session handoff; update it at the end of each session)

---

## Downloading Dependencies (User-Triggered)

**Wait for the user to say they're ready before cloning anything.**

### 1. nanobot — COMPULSORY (when user says to download)

```bash
git clone https://github.com/HKUDS/nanobot
```

When the user says to download/setup, clone this repo, then help them through the full setup (install, onboard, config, Telegram bot, etc.).

### 2. tinyfish-cookbook — OPTIONAL (only if user explicitly asks)

The essentials are already available locally in `deps/tinyfish/`, so this is **not necessary** unless the user specifically wants the full cookbook repo.

```bash
git clone https://github.com/tinyfish-io/tinyfish-cookbook
```

---

## What This Project Is

FomoFam Event Concierge is a Telegram-based personal AI agent for Web3 event participants.
It uses **nanobot** (agent brain + memory + Telegram interface) and **TinyFish** (live web scraping API)
to help three types of users:

- **Attendees** — find relevant Web3 hackathons and events
- **Organizers** — discover grants and funding for their events
- **Sponsors** — find events matching their target audience

This is a **TinyFish Accelerator submission** — 3-day build, ship fast, demo-ready.

---

## Stack

- **nanobot** — Python agent framework, installed via `pip install nanobot-ai`
- **TinyFish** — Browser agent API (`https://agent.tinyfish.ai/v1/automation/run-sse`)
- **LLM provider** — Any supported provider via nanobot (Anthropic, OpenAI, Gemini, etc.)
- **Telegram** — Primary user interface via nanobot channel
- **Shell/bash** — TinyFish called via curl through nanobot's exec tool
- **Markdown** — All skills, memory, and workspace files are .md

---

## Commands

```bash
# Start the nanobot gateway (keeps running, processes Telegram messages)
nanobot gateway

# Start with specific config (multi-instance)
nanobot gateway --config ~/.nanobot/config.json

# Test agent directly in terminal (no Telegram needed)
nanobot agent

# Single message test
nanobot agent -m "Find Web3 hackathons in India this month"

# Check status
nanobot status

# Check nanobot version
nanobot --version

# Install/reinstall nanobot
pip install nanobot-ai
pip install --upgrade nanobot-ai
```

---

## Project File Structure

```
~/.nanobot/
├── config.json                        ← DO NOT COMMIT — contains API keys
└── workspace/
    ├── SOUL.md                        ← Agent personality (edit to change tone)
    ├── AGENTS.md                      ← Behavioral rules (edit to change behavior)
    ├── USER.md                        ← Soumalya's profile for personalization
    ├── MEMORY.md                      ← Auto-updated by agent (do not manually overwrite)
    ├── HISTORY.md                     ← Auto-updated event log (do not manually overwrite)
    ├── HEARTBEAT.md                   ← Periodic monitoring tasks (edit to add/remove)
    ├── skills/
    │   └── tinyfish/
    │       └── SKILL.md              ← TinyFish integration (main file to edit)
    ├── events/                        ← Scraped event results saved here
    │   └── YYYY-MM-DD-events.md
    └── grants/                        ← Discovered grant results saved here
        └── YYYY-MM-DD-grants.md
```

---

## Config Structure

`~/.nanobot/config.json` must have:

```json
{
  "providers": {
    "anthropic": {           // or "openai", "gemini", etc.
      "apiKey": "your-llm-api-key"
    }
  },
  "agents": {
    "defaults": {
      "model": "anthropic/claude-opus-4-5",  // or "openai/gpt-4o", "gemini/gemini-2.0-flash", etc.
      "workspace": "~/.nanobot/workspace"
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "telegram-bot-token",
      "allowFrom": ["your-telegram-user-id"]
    }
  }
}
```

---

## Environment Variables Required

```bash
export TINYFISH_API_KEY="your-tinyfish-key"
export LLM_API_KEY="your-llm-provider-key"   # e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.
```

These must be in the shell environment where `nanobot gateway` runs.
TinyFish key is used inside the skill via `$TINYFISH_API_KEY`.
The LLM key name depends on which provider you configure in `config.json`.

---

## The TinyFish Skill (Core File)

**Location:** `~/.nanobot/workspace/skills/tinyfish/SKILL.md`

This is the most important file in the project. It teaches the agent:

1. How to call the TinyFish API using curl via the exec tool
2. What URLs to scrape for events, grants, sponsors
3. How to format and save results

**When editing the skill:**

- Write instructions TO the agent, not code for a developer
- Use bash curl commands the agent can copy and run via exec
- Always include instructions to save results to workspace files
- Keep descriptions of WHEN to use each section clear

---

## Skill File Frontmatter Rules

Every skill must have valid YAML frontmatter:

```yaml
---
name: skill-name # must match directory name
description: ... # this is the trigger — write it clearly
---
```

The `description` is what makes the agent decide to use this skill.
Make it specific: include WHEN to use it, what user phrases trigger it.

---

## nanobot Behavioral Rules

1. **Never manually edit MEMORY.md or HISTORY.md** — these are auto-managed by nanobot
2. **HEARTBEAT.md** — add tasks here for periodic monitoring (checked every 30 min)
3. **Skills are loaded on demand** — agent reads SKILL.md only when it decides it's relevant
4. **exec tool runs shell commands** — TinyFish curl commands run through exec
5. **Results must be saved** — always instruct agent to save TinyFish output to workspace files
6. **Memory persists across restarts** — MEMORY.md survives gateway restarts

---

## TinyFish API Pattern (for skill writing)

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

Response is SSE stream. Read until `"type": "COMPLETE"` then extract `result` field.

---

## Three Demo Scenarios (for testing)

Test each scenario end-to-end via Telegram before recording demo:

**Demo 1 — Attendee:**

```
Find Web3 hackathons in India happening in the next 2 months
```

**Demo 2 — Organizer:**

```
I'm organizing a DeFi event in Bangalore in July. Find grants and accelerators I can apply to for funding
```

**Demo 3 — Sponsor:**

```
I represent a DeFi protocol. Find Web3 events next month focused on DeFi trading
```

Expected: Real results from live websites in under 60 seconds each.

---

## Pre-Demo Checklist

Before recording the demo:

- [ ] `nanobot gateway` running without errors
- [ ] Telegram bot responding to messages
- [ ] `$TINYFISH_API_KEY` exported in shell
- [ ] TinyFish skill file in correct location
- [ ] At least one test scrape completed successfully
- [ ] workspace/events/ and workspace/grants/ directories exist
- [ ] HEARTBEAT.md has at least one monitoring task

---

## What NOT to Do

- Do not build a custom API wrapper — skills + curl is sufficient
- Do not use Google ADK — overkill for this scope
- Do not add MCP server — skill file is faster for 3-day build
- Do not touch nanobot source code — configure, don't modify
- Do not commit config.json — it contains API keys
- Do not overwrite MEMORY.md manually — let the agent manage it

---

## Troubleshooting

**Agent not responding on Telegram:**

```bash
nanobot status
# Check token and allowFrom in config.json
# Make sure gateway is running: nanobot gateway
```

**TinyFish returns empty:**

```bash
# Check API key
echo $TINYFISH_API_KEY
# Test manually
curl -X POST https://agent.tinyfish.ai/v1/automation/run-sse \
  -H "X-API-Key: $TINYFISH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://ethglobal.com/events", "goal": "List all events"}'
```

**Skill not being used by agent:**

- Check frontmatter description is specific enough
- Check skill directory name matches `name` in frontmatter
- Try explicitly asking: "Use the tinyfish skill to find events"

**Memory getting too large:**

- nanobot auto-consolidates — just let it run
- Force new session: send `/new` to the Telegram bot

## Future Plans

### Obsidian Integration — 10x Memory (Planned, Not Yet Built)

**What:** Point nanobot's workspace directly at an Obsidian vault so every event
scraped, grant discovered, and conversation held becomes a linked, searchable note
inside Obsidian automatically.

**Why it makes memory 10x better:**

- Obsidian is just markdown files — nanobot already speaks markdown natively
- Everything the agent learns shows up in Obsidian's graph view
- Notes link together — grant notes link to event notes link to sponsor profiles
- Full-text search across all agent memory via Obsidian
- Visual knowledge graph of the entire FomoFam ecosystem

**How to enable when ready:**

```json
{
  "agents": {
    "defaults": {
      "workspace": "/path/to/your/ObsidianVault/FomoFam"
    }
  }
}
```

That single config change is all that's needed. The vault becomes the workspace.
MEMORY.md, HISTORY.md, events/, grants/ — all appear inside Obsidian automatically.

---

## VPS Deployment — Docker Setup

When running on a VPS (DigitalOcean, Hetzner, AWS EC2, etc.), run nanobot inside Docker
so it is isolated, auto-restarts on crash, and survives VPS reboots.

---

### Folder Structure on VPS

```
~/fomofam-concierge/
├── .env                          ← API keys — NEVER commit this
├── .gitignore                    ← must include .env and nanobot-data/
├── docker-compose.yml            ← how to run the container
├── config.json                   ← nanobot config (no hardcoded keys — uses .env vars)
└── workspace/
    ├── SOUL.md
    ├── AGENTS.md
    ├── USER.md
    ├── HEARTBEAT.md
    ├── skills/
    │   └── tinyfish/
    │       └── SKILL.md
    ├── events/                   ← auto-created by agent
    └── grants/                   ← auto-created by agent
```

---

### Step 1 — Create `.env` File

```bash
# ~/fomofam-concierge/.env
# NEVER commit this file — add to .gitignore immediately

# Set the key for whichever LLM provider you use in config.json:
# ANTHROPIC_API_KEY=sk-ant-your-key-here
# OPENAI_API_KEY=sk-your-key-here
# GEMINI_API_KEY=your-key-here
TINYFISH_API_KEY=your-tinyfish-key-here
TELEGRAM_BOT_TOKEN=your-telegram-bot-token-here
TELEGRAM_USER_ID=your-telegram-user-id-here
```

Create `.gitignore` immediately:

```
.env
nanobot-data/
workspace/MEMORY.md
workspace/HISTORY.md
workspace/events/
workspace/grants/
```

---

### Step 2 — Create `config.json` (Zero Hardcoded Keys)

nanobot reads `${VAR}` placeholders from environment automatically.

```json
{
  "providers": {
    "anthropic": {                              // swap for "openai", "gemini", etc.
      "apiKey": "${ANTHROPIC_API_KEY}"         // use the matching env var for your provider
    }
  },
  "agents": {
    "defaults": {
      "model": "anthropic/claude-opus-4-5",   // e.g. "openai/gpt-4o", "gemini/gemini-2.0-flash"
      "workspace": "/workspace"
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "${TELEGRAM_BOT_TOKEN}",
      "allowFrom": ["${TELEGRAM_USER_ID}"]
    }
  }
}
```

---

### Step 3 — Create `docker-compose.yml`

```yaml
version: "3.9"

services:
  nanobot:
    image: python:3.12-slim
    container_name: fomofam-concierge
    restart: unless-stopped

    working_dir: /app

    volumes:
      # Workspace files (skills, soul, agents, user profile)
      - ./workspace:/workspace
      # nanobot config
      - ./config.json:/root/.nanobot/config.json
      # Persist memory, sessions, history across restarts
      - ./nanobot-data:/root/.nanobot

    env_file:
      - .env

    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}   # replace/add with your provider's key var
      - TINYFISH_API_KEY=${TINYFISH_API_KEY}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - TELEGRAM_USER_ID=${TELEGRAM_USER_ID}

    command: >
      bash -c "
        pip install nanobot-ai --quiet &&
        nanobot gateway --config /root/.nanobot/config.json
      "

    healthcheck:
      test: ["CMD", "python3", "-c", "import nanobot"]
      interval: 60s
      timeout: 10s
      retries: 3
```

---

### Step 4 — Deploy on VPS

```bash
# SSH into VPS
ssh user@your-vps-ip

# Create project folder
mkdir ~/fomofam-concierge && cd ~/fomofam-concierge

# Create all files (see structure above)
# Then verify .env has all four keys
cat .env

# Start bot in background
docker compose up -d

# Watch live logs
docker compose logs -f

# Check running status
docker compose ps
```

---

### Step 5 — Copy Workspace Files from Local to VPS

Run this from your local machine:

```bash
# Copy entire workspace
scp -r ~/.nanobot/workspace/ user@your-vps-ip:~/fomofam-concierge/workspace/

# Or just the skill file
scp ~/.nanobot/workspace/skills/tinyfish/SKILL.md \
  user@your-vps-ip:~/fomofam-concierge/workspace/skills/tinyfish/SKILL.md
```

---

### Daily VPS Management Commands

```bash
# Watch live logs
docker compose logs -f

# Restart after config or skill file changes
docker compose restart

# Get a shell inside the running container
docker compose exec nanobot bash

# Verify all env vars loaded correctly inside container
docker compose exec nanobot env | grep -E "ANTHROPIC|TINYFISH|TELEGRAM"

# Test TinyFish from inside container
docker compose exec nanobot bash -c '
  curl -s -X POST https://agent.tinyfish.ai/v1/automation/run-sse \
    -H "X-API-Key: $TINYFISH_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"https://ethglobal.com/events\", \"goal\": \"List all events\"}"
'

# Force upgrade nanobot inside container
docker compose exec nanobot pip install --upgrade nanobot-ai

# Full rebuild (after major changes)
docker compose down && docker compose up -d

# Stop everything
docker compose down
```

---

### Auto-Start on VPS Reboot

`restart: unless-stopped` in docker-compose handles crashes automatically.
For VPS reboots:

```bash
# Make Docker start on boot
sudo systemctl enable docker

# Confirm compose starts on reboot
docker compose up -d
```

---

### Persistence — What Survives Restarts

| Data                          | Location                             | Survives? |
| ----------------------------- | ------------------------------------ | --------- |
| MEMORY.md (agent memory)      | `./nanobot-data/workspace/memory/`   | ✅ Yes    |
| HISTORY.md (conversation log) | `./nanobot-data/workspace/memory/`   | ✅ Yes    |
| Sessions                      | `./nanobot-data/workspace/sessions/` | ✅ Yes    |
| Scraped events                | `./workspace/events/`                | ✅ Yes    |
| Discovered grants             | `./workspace/grants/`                | ✅ Yes    |
| Skills                        | `./workspace/skills/`                | ✅ Yes    |
| Config                        | `./config.json`                      | ✅ Yes    |

---

### Security Rules

- `.env` never goes in git — gitignore it day one
- `config.json` uses `${VAR}` — no raw keys ever in the file
- Telegram polling needs **no open ports** — bot reaches out to Telegram, Telegram doesn't reach in
- No nginx, no webhook, no exposed ports needed for this setup
- Run container as non-root when possible on production VPS

---

### Local vs VPS Comparison

|                       | Local                    | VPS + Docker                           |
| --------------------- | ------------------------ | -------------------------------------- |
| Start                 | `nanobot gateway`        | `docker compose up -d`                 |
| Config                | `~/.nanobot/config.json` | `./config.json` mounted via volume     |
| Workspace             | `~/.nanobot/workspace/`  | `./workspace/` mounted to `/workspace` |
| API keys              | Exported in shell        | Loaded from `.env` file                |
| Logs                  | Terminal                 | `docker compose logs -f`               |
| Auto-restart on crash | ❌ No                    | ✅ Yes                                 |
| Survives VPS reboot   | ❌ No                    | ✅ Yes (with systemctl enable docker)  |
