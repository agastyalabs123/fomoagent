---
name: tinyfish
description: Scrape any website or automate multi-step browser tasks using TinyFish web agents. Returns structured JSON from any URL using plain English goals.
homepage: https://tinyfish.ai
metadata: {"nanobot":{"emoji":"🐟","requires":{"env":["TINYFISH_API_KEY"]}}}
---

# TinyFish

SOTA web agents in an API. Turn any website into structured JSON using plain English goals.
No browser setup, no selectors — just a URL and a goal.

## When to use

Use this skill when the user asks any of:
- "scrape …"
- "get data from …"
- "extract … from a website"
- "find … on the web"
- "browse / navigate to …"
- "check the price / availability / details of …"
- "monitor …"
- "run [multiple/parallel] searches across …"

## Quick start (Python)

```python
import os, json, requests

def tinyfish(url: str, goal: str) -> dict:
    response = requests.post(
        "https://agent.tinyfish.ai/v1/automation/run-sse",
        headers={
            "X-API-Key": os.environ["TINYFISH_API_KEY"],
            "Content-Type": "application/json",
        },
        json={"url": url, "goal": goal},
        stream=True,
    )
    for line in response.iter_lines():
        if line:
            text = line.decode("utf-8")
            if text.startswith("data: "):
                event = json.loads(text[6:])
                if event.get("type") == "COMPLETE":
                    return event.get("result")

result = tinyfish(
    url="https://example.com",
    goal="Extract all product names and prices. Return as JSON.",
)
print(json.dumps(result, indent=2))
```

## Quick start (cURL)

```bash
curl -N -X POST https://agent.tinyfish.ai/v1/automation/run-sse \
  -H "X-API-Key: $TINYFISH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "goal": "Extract all product names and prices"}'
```

## Parallel scraping (multiple sites at once)

Use `asyncio` + `asyncio.gather` when the user wants data from multiple URLs simultaneously:

```python
import asyncio, os, json
import httpx

async def tinyfish_async(client, url: str, goal: str) -> dict:
    async with client.stream(
        "POST",
        "https://agent.tinyfish.ai/v1/automation/run-sse",
        headers={
            "X-API-Key": os.environ["TINYFISH_API_KEY"],
            "Content-Type": "application/json",
        },
        json={"url": url, "goal": goal},
        timeout=120,
    ) as response:
        async for line in response.aiter_lines():
            if line.startswith("data: "):
                event = json.loads(line[6:])
                if event.get("type") == "COMPLETE":
                    return {"url": url, "result": event.get("result")}

async def scrape_parallel(targets: list[dict]) -> list[dict]:
    """targets = [{"url": "...", "goal": "..."}, ...]"""
    async with httpx.AsyncClient() as client:
        return await asyncio.gather(
            *[tinyfish_async(client, t["url"], t["goal"]) for t in targets]
        )

# Example: scrape 3 sites at once
results = asyncio.run(scrape_parallel([
    {"url": "https://site1.com", "goal": "Extract all job listings"},
    {"url": "https://site2.com", "goal": "Extract all job listings"},
    {"url": "https://site3.com", "goal": "Extract all job listings"},
]))
print(json.dumps(results, indent=2))
```

## Browser profiles

Add `"browser_profile"` to the request body to control stealth behaviour:

| Profile  | Use when |
|----------|----------|
| `"lite"` | Default — fast, most sites |
| `"stealth"` | Bot-protected sites (Cloudflare, Akamai) |

```python
json={"url": url, "goal": goal, "browser_profile": "stealth"}
```

## Notes

- `TINYFISH_API_KEY` must be set in the environment. Get one at https://tinyfish.ai
- The API streams SSE events; only the final `COMPLETE` event contains the result.
- Goals are plain English — be specific about the output format (e.g. "return as JSON array").
- For multi-step flows (login → navigate → extract), describe each step in the goal.
- Parallel calls are TinyFish's killer feature — always prefer `asyncio.gather` over sequential calls.
