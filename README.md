# FomoFam Event Concierge

A Telegram-based AI agent that helps Web3 participants find events, discover grants, and target audiences — powered by **nanobot** and **TinyFish**.

---

## What It Does

Three use cases, one bot:

| Who | Ask | Gets |
|-----|-----|------|
| **Attendee** | "Find Web3 hackathons in India" | Live event list with dates and locations |
| **Organizer** | "Find grants for my DeFi event in Bangalore" | Relevant grants and accelerators to apply to |
| **Sponsor** | "Find DeFi events for my protocol" | Targeted events matching their audience |

---

## How It Works

```
Telegram message
  → nanobot agent loop
    → reads skill: use-tinyfish
      → runs: tinyfish agent run --url <site> "<goal>"
        → live web scraping via TinyFish browser agent
    → formats + saves results to workspace
  → reply on Telegram
```

- **nanobot** handles the agent loop, memory, skills, and Telegram integration
- **TinyFish** handles live website scraping via natural language browser automation
- **Skills** are Markdown files — no code needed to extend the agent

---

## Project Structure

```
tinyfish2/
├── deps/
│   ├── nanobot/          ← nanobot reference repo (read this first)
│   └── tinyfish/         ← TinyFish CLI skill + examples
│       ├── skills/use-tinyfish/SKILL.md
│       └── examples/
├── CLAUDE.md             ← Claude Code configuration and instructions
├── CONTEXT.md            ← Active task log and session handoff
└── README.md             ← This file

~/.nanobot/               ← Runtime config (not in repo)
├── config.json
└── workspace/
    ├── SOUL.md
    ├── AGENTS.md
    ├── USER.md
    ├── HEARTBEAT.md
    ├── skills/tinyfish/SKILL.md
    ├── events/
    └── grants/
```

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js (for TinyFish CLI)
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- An LLM API key (Anthropic, OpenAI, Gemini, etc.)
- A TinyFish API key — get one at [agent.tinyfish.ai/api-keys](https://agent.tinyfish.ai/api-keys)

### 1. Install nanobot

```bash
pip install nanobot-ai
nanobot onboard
```

### 2. Install TinyFish CLI

```bash
npm install -g @tiny-fish/cli
tinyfish auth login
```

### 3. Configure nanobot

Edit `~/.nanobot/config.json`:

```json
{
  "providers": {
    "anthropic": {
      "apiKey": "your-llm-api-key"
    }
  },
  "agents": {
    "defaults": {
      "model": "anthropic/claude-opus-4-5",
      "workspace": "~/.nanobot/workspace"
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "your-telegram-bot-token",
      "allowFrom": ["your-telegram-user-id"]
    }
  }
}
```

### 4. Export environment variables

```bash
export TINYFISH_API_KEY="your-tinyfish-key"
export ANTHROPIC_API_KEY="your-llm-key"   # or OPENAI_API_KEY, GEMINI_API_KEY, etc.
```

### 5. Copy the TinyFish skill

```bash
mkdir -p ~/.nanobot/workspace/skills/tinyfish
cp deps/tinyfish/skills/use-tinyfish/SKILL.md ~/.nanobot/workspace/skills/tinyfish/SKILL.md
```

### 6. Run

```bash
nanobot gateway
```

---

## Testing Without Telegram

```bash
# Interactive terminal session
nanobot agent

# Single message test
nanobot agent -m "Find Web3 hackathons in India this month"
```

---

## Three Demo Scenarios

**Attendee:**
```
Find Web3 hackathons in India happening in the next 2 months
```

**Organizer:**
```
I'm organizing a DeFi event in Bangalore in July. Find grants and accelerators I can apply to for funding
```

**Sponsor:**
```
I represent a DeFi protocol. Find Web3 events next month focused on DeFi trading
```

---

## Reference

- `deps/nanobot/` — full nanobot source and docs
- `deps/tinyfish/` — TinyFish skill and usage examples
- `CLAUDE.md` — full project config, architecture, and build instructions
- `CONTEXT.md` — active checklist and session notes

---

## Built For

[TinyFish Accelerator](https://www.tinyfish.ai/accelerator) — 3-day build.
