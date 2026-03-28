#!/usr/bin/env node

import { OpenRouter } from '@openrouter/sdk';
import dotenv from 'dotenv';

dotenv.config();

/** Max context length (tokens) to treat as “small”. Override: OPENROUTER_SMALL_CONTEXT_MAX */
const SMALL_CONTEXT_MAX = Number.parseInt(
    process.env.OPENROUTER_SMALL_CONTEXT_MAX ?? '32768',
    10,
);

const openRouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
    httpReferer: 'http://localhost',
    appTitle: 'getModels',
    timeoutMs: 60_000,
});

function isZeroUsdPerToken(value) {
    const n = Number.parseFloat(String(value ?? ''));
    return Number.isFinite(n) && n === 0;
}

/** OpenRouter free tier: id ends with :free and catalog shows $0 prompt + completion. */
function isCompletelyFree(model) {
    if (!model.id.endsWith(':free')) return false;
    return (
        isZeroUsdPerToken(model.pricing.prompt) &&
        isZeroUsdPerToken(model.pricing.completion)
    );
}

function isSmallContext(model) {
    return (
        model.contextLength != null &&
        model.contextLength > 0 &&
        model.contextLength <= SMALL_CONTEXT_MAX
    );
}

async function main() {
    if (!process.env.OPENROUTER_API_KEY) {
        console.error('Missing OPENROUTER_API_KEY (e.g. in .env)');
        process.exit(1);
    }

    const { data } = await openRouter.models.list({}, { timeoutMs: 60_000 });

    const matches = data
        .filter(isCompletelyFree)
        .filter(isSmallContext)
        .sort((a, b) => a.contextLength - b.contextLength);

    console.log(
        `Small + fully free (:free, $0 prompt & completion), context ≤ ${SMALL_CONTEXT_MAX}: ${matches.length}\n`,
    );

    for (const m of matches) {
        console.log(`${m.id}\tctx=${m.contextLength}\t${m.name}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
