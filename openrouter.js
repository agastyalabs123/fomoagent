// test-openrouter.js   ← Fixed version
import { OpenRouter } from '@openrouter/sdk';
import dotenv from 'dotenv';

dotenv.config();

console.log("✅ OpenRouter SDK loaded");
console.log("API Key loaded:", process.env.OPENROUTER_API_KEY ? "Yes" : "No");

// Explicit :free IDs from your catalog (getModels.js). Override: OPENROUTER_MODEL=...
// Default: Venice Dolphin Mistral 24B (strong on free tier).
// Lighter / often faster: OPENROUTER_MODEL=google/gemma-3n-e2b-it:free
const MODEL =
    process.env.OPENROUTER_MODEL ||
    'cognitivecomputations/dolphin-mistral-24b-venice-edition:free';

// @openrouter/sdk v0.10.x uses httpReferer / appTitle (not defaultHeaders).
const openRouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
    httpReferer: 'http://localhost',
    appTitle: 'My Test Script',
    timeoutMs: 120_000,
});

const FALLBACK_FREE_MODEL = 'openrouter/free';

const MESSAGES = [
    {
        role: 'user',
        content: 'Write a funny coding joke for a developer.',
    },
];

/** Non-streaming chat completion for the given model and messages. */
function sendChatResponse(model, messages = MESSAGES) {
    return openRouter.chat.send(
        {
            chatGenerationParams: {
                model,
                messages,
                stream: false,
                maxCompletionTokens: 256,
            },
        },
        { timeoutMs: 120_000 },
    );
}

function isNonRetryableClientError(message) {
    const m = String(message ?? '');
    return (
        m.includes('API key') ||
        m.includes('401') ||
        m.includes('validation') ||
        m.includes('Input validation failed')
    );
}

async function run() {
    const started = Date.now();
    let result;
    let usedModel = MODEL;

    try {
        console.log(`Calling OpenRouter (${MODEL})…`);
        result = await sendChatResponse(MODEL);
    } catch (firstErr) {
        const msg = String(firstErr?.message ?? firstErr);
        if (isNonRetryableClientError(msg)) {
            console.error('❌ Error:', msg);
            if (msg.includes('API key') || msg.includes('401')) {
                console.log(
                    '\n💡 Tip: Check that your OPENROUTER_API_KEY in .env is correct and has no extra spaces.',
                );
            } else if (msg.includes('validation') || msg.includes('Input validation')) {
                console.log(
                    '\n💡 Validation error — check chatGenerationParams / SDK usage.',
                );
            }
            process.exit(1);
        }

        console.warn(`⚠️ ${MODEL} failed: ${msg}`);
        console.log(`Retrying with ${FALLBACK_FREE_MODEL}…`);

        try {
            result = await sendChatResponse(FALLBACK_FREE_MODEL);
            usedModel = FALLBACK_FREE_MODEL;
        } catch (secondErr) {
            console.error('❌ Error:', secondErr.message);
            process.exit(1);
        }
    }

    const text = result.choices[0].message.content;
    const secs = ((Date.now() - started) / 1000).toFixed(1);

    console.log(`\n🤖 OpenRouter Response — ${usedModel} (${secs}s):\n`);
    console.log(text);
}

run().catch(console.error);