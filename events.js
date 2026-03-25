import dotenv from 'dotenv';
dotenv.config()

import fs from 'fs/promises';

const apiKey = process.env.TINYFISH_API_KEY;

const SOLANA_EVENTS_URL = "https://solana.com/events"
const CRYPTO_NOMAND_URL = 'https://cryptonomads.org/'
const ETH_GLOBAL_EVENTS_URL = 'https://ethglobal.com/events'
const GOAL = 'Extract all events listed on this page. For each event return: event name, event description, start date, end date (if different from start date, otherwise null), event time, event location'

async function scrapeEvents(url) {
    console.log(`Scraping: ${url}...`);
    const response = await fetch("https://agent.tinyfish.ai/v1/automation/run-sse", {
        method: "POST",
        headers: {
            "X-API-Key": apiKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            url,
            goal: GOAL,
        }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        for (const line of text.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const event = JSON.parse(line.slice(6));
            if (event.type === 'COMPLETE') {
                console.log(`Done: ${url}`);
                return event.result;
            }
        }
    }
}

const [solana, cryptoNomads, ethGlobal] = await Promise.all([
    scrapeEvents(SOLANA_EVENTS_URL),
    scrapeEvents(CRYPTO_NOMAND_URL),
    scrapeEvents(ETH_GLOBAL_EVENTS_URL),
]);

const result = {
    solana,
    cryptoNomads,
    ethGlobal,
};

console.log(JSON.stringify(result, null, 2));

await fs.writeFile(
    new URL('./events.json', import.meta.url),
    JSON.stringify(result, null, 2),
    'utf8',
);