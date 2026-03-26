# context.md

# FomoFam Event Concierge — Active Task Log

# Update this file at the end of every session

## Read First

- Check out `tinyfish-cookbook/README.md`
- Check out `nanobot/README.md`

---

## Current Goal

**Ship a working demo of FomoFam Event Concierge for TinyFish Accelerator.**

Three scenarios must work end-to-end via Telegram:

1. Attendee finds Web3 hackathons in India
2. Organizer discovers grants for a DeFi event
3. Sponsor finds events for their DeFi audience

---

## Timeline

| Day   | Focus                                                      | Status         |
| ----- | ---------------------------------------------------------- | -------------- |
| Day 1 | nanobot setup + Telegram working + first TinyFish scrape   | ⬜ Not started |
| Day 2 | Grant discovery flow + save to workspace files + heartbeat | ⬜ Not started |
| Day 3 | Polish + record demo + tweet thread posted                 | ⬜ Not started |

---

## Day 1 Checklist

### Environment Setup

- [ ] `pip install nanobot-ai` completed
- [ ] `nanobot onboard` run
- [ ] `~/.nanobot/config.json` created with Anthropic key
- [ ] Telegram bot created via @BotFather
- [ ] Telegram token added to config.json
- [ ] Own Telegram user ID added to `allowFrom`
- [ ] `export TINYFISH_API_KEY=...` in shell
- [ ] `export ANTHROPIC_API_KEY=...` in shell

### Workspace Files

- [ ] `~/.nanobot/workspace/USER.md` created (Soumalya's profile)
- [ ] `~/.nanobot/workspace/SOUL.md` created (agent personality)
- [ ] `~/.nanobot/workspace/AGENTS.md` created (behavior rules)
- [ ] `~/.nanobot/workspace/skills/tinyfish/SKILL.md` created

### First Test

- [ ] `nanobot gateway` running without errors
- [ ] Telegram bot responding to a test message
- [ ] TinyFish manual curl test works (ETHGlobal scrape)
- [ ] Agent uses tinyfish skill when asked about events
- [ ] First real event scrape result returned via Telegram

---

## Day 2 Checklist

### Grant Discovery

- [ ] `~/.nanobot/workspace/grants/` directory created
- [ ] `~/.nanobot/workspace/events/` directory created
- [ ] Grant discovery flow tested end-to-end
- [ ] Results saved as .md files in workspace
- [ ] At least 10 relevant grants returned for "DeFi event Bangalore"

### Memory and Scheduling

- [ ] HEARTBEAT.md has grant monitoring task
- [ ] Agent remembers user profile across sessions (test: close and reopen)
- [ ] `/new` command tested (resets session, archives to memory)

### Three Persona Test

- [ ] Attendee demo scenario works
- [ ] Organizer demo scenario works
- [ ] Sponsor demo scenario works

---

## Day 3 Checklist

### Demo Recording

- [ ] Screen recording software ready
- [ ] All three scenarios work reliably (test 3x each)
- [ ] Response time under 60 seconds per query
- [ ] Results look clean and formatted

### Tweet Thread

- [ ] Thread drafted (see PROJECT_CONTEXT.md for template)
- [ ] Screenshots/video captured
- [ ] @Tiny_Fish tagged
- [ ] #BuildInPublic hashtag included
- [ ] Posted and live

### Accelerator Submission

- [ ] Demo link ready (video or live bot)
- [ ] Project description written
- [ ] Application submitted at https://www.tinyfish.ai/accelerator

---

## Active Blockers

<!-- Add blockers as they come up during the build -->

- None yet

---

## Decisions Made

| Decision                          | Reasoning                                                      |
| --------------------------------- | -------------------------------------------------------------- |
| Skills over MCP for TinyFish      | Faster, no extra server, 3-day constraint                      |
| nanobot over Google ADK           | ADK overkill — nanobot has spawn, memory, Telegram built-in    |
| Markdown skill file               | Agent reads curl commands directly, zero code needed           |
| Telegram as interface             | Already Soumalya's primary channel, nanobot supports natively  |
| Grant discovery as killer feature | Real organizer pain, differentiator from generic event finders |
| curl + exec for TinyFish          | No wrapper library needed, works with nanobot exec tool        |

---

## Known Issues

<!-- Add issues discovered during build -->

- None yet

---

## Completed (Archive)

<!-- Move finished items here to keep above sections clean -->

---

## Key Files Reference

| File                                 | Purpose                    | Edit Frequency                     |
| ------------------------------------ | -------------------------- | ---------------------------------- |
| `~/.nanobot/config.json`             | API keys + Telegram token  | Once at setup                      |
| `workspace/SOUL.md`                  | Agent personality          | Rarely                             |
| `workspace/AGENTS.md`                | Behavior rules             | When behavior needs changing       |
| `workspace/USER.md`                  | Soumalya's profile         | When profile changes               |
| `workspace/HEARTBEAT.md`             | Periodic tasks             | Add/remove tasks as needed         |
| `workspace/skills/tinyfish/SKILL.md` | TinyFish integration       | When adding new scraping use cases |
| `workspace/MEMORY.md`                | Auto-managed — do not edit | Never (auto)                       |
| `workspace/HISTORY.md`               | Auto-managed — do not edit | Never (auto)                       |

---

## TinyFish Cookbook — Standards & Skills

These files govern how Claude Code should write code and use the TinyFish CLI in this project.

### When to use these

- **Before writing any code** — load org standards via the rules below
- **When scraping / extracting web data** — follow the `use-tinyfish` skill
- **When reviewing or writing a PR** — apply coding standards

### Standards (`.claude/`)

| File | Purpose |
| ---- | ------- |
| `tinyfish-cookbook/.claude/rules/load-org-standards.md` | Auto-loaded rule: how to discover and apply org standards before any task |
| `tinyfish-cookbook/.claude/best-practices/coding-standards.md` | TinyFish engineering code quality principles (DRY, naming, error handling, PRs, etc.) |

**Load order** (from `load-org-standards.md`):
1. Read `coding-standards.md` — wins on style, naming, structure, DRY
2. Detect repo type (`pyproject.toml` → `python_app`, `package.json` + `next.config.*` → `nextjs_app`, etc.)
3. Read `.claude/best-practices/<repo_type>/best-practices.md` — wins on tooling and framework patterns

### Skills (`skills/`)

| File | Purpose |
| ---- | ------- |
| `tinyfish-cookbook/skills/use-tinyfish/SKILL.md` | How to use the `tinyfish` CLI for web scraping and browser automation |

**Key points from `use-tinyfish`:**
- Always run pre-flight checks: `which tinyfish && tinyfish --version` and `tinyfish auth status`
- Core command: `tinyfish agent run --url <url> "<goal>"`
- Always specify JSON output format in the goal string
- For multiple independent sites: make **parallel** separate CLI calls, never combine into one goal
- Final result is in the `resultJson` field of the SSE event where `type == "COMPLETE"`
- Install: `npm install -g @tiny-fish/cli`; auth: `tinyfish auth login` or `export TINYFISH_API_KEY=...`

### How skills work in nanobot

Skills are Markdown files at `~/.nanobot/workspace/skills/<name>/SKILL.md`. The agent reads them on demand via the `read_file` tool. To add the TinyFish skill to the live nanobot workspace:

```bash
mkdir -p ~/.nanobot/workspace/skills/tinyfish
cp tinyfish-cookbook/skills/use-tinyfish/SKILL.md ~/.nanobot/workspace/skills/tinyfish/SKILL.md
```

Then reference it in `workspace/AGENTS.md` so the agent knows it exists.

---

## Quick Commands Reference

```bash
# Start the bot
nanobot gateway

# Test without Telegram
nanobot agent -m "Find Web3 hackathons in India"

# Check everything is working
nanobot status

# Test TinyFish directly
curl -N -X POST https://agent.tinyfish.ai/v1/automation/run-sse \
  -H "X-API-Key: $TINYFISH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://ethglobal.com/events", "goal": "List all events with dates and locations"}'

# Reset session (if agent seems confused)
# Send to Telegram bot: /new
```

---

## Session Notes

### Session 1 — [DATE]

<!-- Add what was done, what worked, what broke, where you stopped -->

---

## Next Session Starting Point

<!-- At end of each session, write: "Next session: start with X" -->

Next session: Start with Day 1 environment setup. Run `nanobot onboard` first.
