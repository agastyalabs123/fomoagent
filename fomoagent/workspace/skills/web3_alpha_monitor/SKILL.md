---
name: web3-alpha-monitor
description: Use this for Web3 event finding and manual alpha checks using Solana Events, CryptoNomads, and ETHGlobal sources.
always: true
---

# Web3 Alpha Monitor Skill

This skill is for the current MVP only:

- Event discovery
- Manual alpha monitor (only on explicit user request)

Do not run unrelated research modules unless explicitly asked.

## Trigger Phrases

Use this skill when user asks things like:

- "find web3 events"
- "hackathons in [city/country]"
- "events this month"
- "run alpha monitor"
- "check event sponsor activity"

## Data Sources

Use these sources first:

- https://solana.com/events
- https://cryptonomads.org/
- https://ethglobal.com/events

These sources are the MVP set aligned to `deps/tinyfish/examples/events.js`.

## TinyFish Execution Pattern

Use one TinyFish run per website. Never merge multiple websites in one goal.
When several sources are needed, run them in parallel.

Example via exec:

```bash
curl -N -X POST https://agent.tinyfish.ai/v1/automation/run-sse \
  -H "X-API-Key: $TINYFISH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"URL_HERE","goal":"GOAL_HERE"}' \
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

## Event Extraction Contract

For each event, extract:

- name
- startDate
- endDate
- city
- country
- chainOrEcosystem
- eventType
- sourceUrl
- whyRelevant
- signalTags
- confidence

Rules:

- Deduplicate by name + date + location
- Keep unknown values as null
- Do not hallucinate details

## Alpha Monitor (Manual-Only)

Only run when user explicitly asks.

Focus on:

- new event announcements
- registration openings / deadlines
- sponsor or protocol activity attached to events

Extract alpha signals as:

- signalType (announcement | registration | sponsor)
- entity
- change
- significance (low | medium | high)
- evidenceUrl

## Required Response Format

Always return both sections:

1. Short digest in markdown
2. JSON payload:

```json
{
  "query": "string",
  "generatedAt": "ISO-8601",
  "events": [],
  "alphaSignals": []
}
```

## Persistence

- Save event outputs to `workspace/events/YYYY-MM-DD-events.md`
- Save alpha outputs to `workspace/alpha/YYYY-MM-DD-HH-signals.md`
- Append only high-signal memory points in `MEMORY.md` under:
  - `## Concierge MVP Memory`
