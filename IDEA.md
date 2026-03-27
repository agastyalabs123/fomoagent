# Web3 Personal Intelligence Agent

## 1. What I Want to Achieve

I want to build a persistent, always-on AI agent that acts as my personal intelligence layer for the Web3 ecosystem. Not a chatbot you open when you need it — something that runs continuously, learns over time, monitors the space on my behalf, and surfaces signal I would have missed.

The agent should know my stack (Solana, Rust, EVM), my projects (FomoFam, SprkClub, DegenCalls), my network, and my goals. Over time it builds a connected knowledge graph of the Web3 ecosystem — opportunities, people, competitors, projects — and makes me meaningfully faster at decisions that currently take hours of manual research.

The core outcome: I spend less time searching and more time building.

---

## 2. What is the TinyFish Accelerator

TinyFish is a browser automation API that lets you treat any real website as a programmable data source. Instead of dealing with headless browsers, selectors, proxies, and JavaScript rendering failures, you send a URL and a plain English goal and get back clean structured data.

It handles the hard parts of the web — JS-rendered pages, infinite scroll, login walls, dynamic content, anti-bot protection — with built-in stealth mode and rotating proxies included.

The TinyFish Accelerator is a 9-week program with a $2M seed investment pool, free API credits, engineering support, and business mentorship. It is designed for builders creating real products on top of the TinyFish infrastructure. This project is my submission for that accelerator.

The key capability TinyFish provides that nothing else does reliably: it can browse the web the way a human does, at scale, across many sites simultaneously.

---

## 3. Five Intelligence Modules

### Opportunity Hunter

I have won 12+ hackathons including ETH Global and ETH India. The way I currently find opportunities is manually — checking ETHGlobal, Devfolio, Dorahacks, Superteam, Questbook, and Gitcoin separately, reading through every prize track, and figuring out which ones my stack actually qualifies for. That process takes hours and I still miss things.

The Opportunity Hunter automates exactly that workflow. It knows my stack — Solana, Rust, Anchor, EVM, Solidity, TypeScript — and it knows my existing deployments. When a new hackathon opens, it does not just tell me it exists. It reads every prize track, cross-references what I have already built, and tells me specifically which tracks I have a genuine shot at and why. "Base Batches is open, the consumer crypto track aligns directly with DegenCalls which is already deployed on Base Sepolia, prize is $15k, you have 3 weeks." That is the output I actually need.

It also scores by prize-to-effort ratio — a metric I use manually today. A $5k prize that fits an existing project beats a $50k prize that needs a ground-up build in a language I don't use. The agent learns this preference over time and weights its recommendations accordingly.

Beyond hackathons it covers accelerator applications like TinyFish itself, ecosystem grants from Solana Foundation and Base, and bounties on Superteam. All sources swept in parallel, all results filtered to what is actually relevant to my profile, delivered on a weekly cadence so I never miss a deadline again.

---

### Web3 Alpha Monitor

Watches the live pulse of the ecosystem across three surfaces that directly touch my projects.

For FomoFam it monitors Web3 event announcements, hackathon registrations opening, and sponsor activity — who is newly funding events, which protocols just announced event budgets, which communities are growing fast enough to be worth targeting.

For SprkClub it tracks creator token launches on Solana, bonding curve graduation patterns on Pump.fun and Meteora, and creator economy signals — which niches are getting traction, what token structures fans are actually engaging with versus ignoring.

For DegenCalls it watches prediction market activity, new market categories opening on competitors, and on-chain volatility signals that suggest where the next wave of degen attention is flowing.

Runs on cron. Surfaces anomalies, not noise. The intelligence is in the filtering.

**Reputation Engine lives inside this module.** When a project launches anywhere in the ecosystem — a new creator token on SprkClub's competitor, a new prediction market protocol, a new hackathon project claiming a prize track — the agent runs a full due diligence pass. It hits Twitter for account age and engagement quality, GitHub for actual code versus a placeholder README, the official website for team transparency, and on-chain for wallet history and any prior rug activity. All four sources in parallel via sub-agents. The output is a readable verdict — not a black box score but a plain English summary of what the evidence shows. Memory makes this compounding: a wallet or team that gets flagged once is flagged permanently in every future lookup. For SprkClub specifically, this becomes a trust layer for creator token launches. For DegenCalls, it feeds into market resolution credibility.

---

### KOL and Partnership Scout

At events like Solana Breakpoint, the best connections happen by accident — because you were physically in the room. Most of those connections never happen because you cannot be everywhere.

Lisa Kim is a concrete example. She is a Korean Web3 community operator and KOL marketer with connections to over 100 Korean KOLs and involvement with SojuDAO. Her exact pain points — sponsors not paying, low attendee quality — map directly to what FomoFam solves. She is the ideal partnership for the Korean market expansion. I found her through my own research, but it took time and there are a hundred Lisa Kims I have never found.

The KOL and Partnership Scout automates this discovery. I describe who I am looking for — a community operator in a specific geography, a builder with a specific stack, a creator with a genuine audience in a niche I am targeting — and the agent searches across Twitter profiles, conference speaker lists, DAO contributor pages, and community directories. It does not return a list of names. It returns people with evidence: why they match, what their actual reach looks like, whether their community engagement is real or inflated, what their history in the space suggests about them as a partner.

It also cross-references against the Reputation Engine. A KOL with a strong Twitter presence but a history of promoting rugged projects gets flagged, not recommended. The network I build through this agent is one I can actually trust.

Over time memory builds a living map of the ecosystem — who knows who, which communities overlap, which operators have skin in the game versus which are purely mercenary. The kind of context that currently only exists in my head after years of attending events, automated.

---

### Ecosystem Monitor

I am building in three competitive spaces simultaneously. Launchpads for SprkClub. Prediction markets for DegenCalls. Event infrastructure for FomoFam. Manually tracking what competitors are doing across all three is not realistic.

The Ecosystem Monitor watches named competitors on a weekly cadence. For SprkClub it tracks Pump.fun, Friend.tech successors, and any new creator token infrastructure on Solana. For DegenCalls it tracks Polymarket, Drift prediction markets, and any new binary market protocols launching on EVM chains. For FomoFam it tracks Luma, Eventbrite's Web3 adjacent activity, and any new on-chain event tooling.

TinyFish scrapes their public surfaces — feature pages, pricing, changelog announcements, community growth signals. The agent writes diffs to memory. When I ask "what changed in the competitive landscape this week" there is a real answer grounded in evidence. When a competitor ships a feature I was planning to build, I know immediately. When a competitor's community growth stalls, that is signal too — it tells me what is not working so I do not repeat it.

This feeds directly into product sequencing decisions. Which feature to build next, which market to enter first, where to position against what already exists — all of that gets sharper when the competitive picture is continuously updated rather than based on whatever I last happened to read.

---

## 4. Future Directions

### RAG Implementation

As memory accumulates — scraped events, scored projects, discovered KOLs, opportunity history, competitive intelligence — the raw storage approach hits limits. The next evolution is a proper retrieval-augmented generation layer where all accumulated intelligence becomes a searchable knowledge base. Instead of the agent holding everything in a flat memory file, it queries a vector store at inference time, pulling the most relevant past intelligence for whatever question is being asked. This makes the system genuinely smarter the longer it runs, rather than just larger.

### Multi-Agent Architecture

The current design uses sub-agents tactically for parallelism — one sub-agent per site during a broad sweep. The future architecture makes this structural. Dedicated specialist agents running permanently: one that only watches on-chain activity, one that only tracks KOLs, one that only scores new projects. A coordinator agent that aggregates signal from all specialists and handles user interaction. Each specialist runs independently, maintains its own focused memory, and publishes findings to a shared intelligence layer that the coordinator reads from. This mirrors how a real research team works — specialists who go deep, a generalist who synthesizes and communicates.
