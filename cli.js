#!/usr/bin/env node

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const API_BASE =
    process.env.FOMOAGENT_API_BASE ||
    process.env.FOMOAGENT_BASE_URL ||
    'http://localhost:18790';

let sessionId = process.env.FOMOAGENT_SESSION_ID || `cli:${Date.now()}`;

function printHelp() {
    console.log('\nCommands:');
    console.log('  :help                 Show this help');
    console.log('  :session <id>         Switch session ID');
    console.log('  :new                  Reset current session on server');
    console.log('  :status               Show current session status');
    console.log('  :cron list            List all cron jobs');
    console.log('  :cron enable <id>     Enable a cron job');
    console.log('  :cron disable <id>    Disable a cron job');
    console.log('  :cron run <id>        Run a cron job immediately');
    console.log('  :clear, clear, cls    Clear the terminal');
    console.log('  :exit, exit, quit     Quit\n');
}

async function postJson(path, body) {
    const resp = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const text = await resp.text();
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }
    if (!resp.ok) {
        const msg = data?.detail || data?.error || `HTTP ${resp.status}`;
        throw new Error(msg);
    }
    return data;
}

async function getJson(path) {
    const resp = await fetch(`${API_BASE}${path}`);
    const text = await resp.text();
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }
    if (!resp.ok) {
        const msg = data?.detail || data?.error || `HTTP ${resp.status}`;
        throw new Error(msg);
    }
    return data;
}

async function checkHealth() {
    try {
        const health = await getJson('/health');
        if (!health?.ok) throw new Error('Server not healthy');
    } catch (err) {
        console.error(`Cannot reach fomoagent at ${API_BASE}`);
        console.error('Start it first: cd fomoagent && npm run dev');
        console.error(`Details: ${err.message}`);
        process.exit(1);
    }
}

async function run() {
    await checkHealth();

    console.log('fomoagent CLI');
    console.log(`API: ${API_BASE}`);
    console.log(`Session: ${sessionId}`);
    printHelp();

    const rl = readline.createInterface({ input, output });

    try {
        while (true) {
            const line = (await rl.question('you> ')).trim();
            if (!line) continue;

            const quit = line.toLowerCase();
            if (
                line === ':exit' ||
                line === ':quit' ||
                quit === 'exit' ||
                quit === 'quit'
            )
                break;
            if (line === ':clear' || quit === 'clear' || quit === 'cls') {
                console.clear();
                continue;
            }
            if (line === ':help') {
                printHelp();
                continue;
            }

            if (line.startsWith(':session ')) {
                const next = line.replace(':session ', '').trim();
                if (!next) {
                    console.log('usage: :session <id>');
                    continue;
                }
                sessionId = next;
                console.log(`session set to ${sessionId}`);
                continue;
            }

            if (line === ':new') {
                try {
                    const res = await postJson('/v1/sessions/new', { sessionId });
                    console.log(`agent> session reset (${res?.sessionId || sessionId})`);
                } catch (err) {
                    console.log(`agent> error: ${err.message}`);
                }
                continue;
            }

            if (line.startsWith(':cron')) {
                const parts = line.split(/\s+/);
                const sub = parts[1];
                const id = parts[2];

                if (sub === 'list') {
                    try {
                        const jobs = await getJson('/v1/cron/jobs');
                        if (!jobs.length) { console.log('no cron jobs'); continue; }
                        for (const j of jobs) {
                            const status = j.enabled ? 'enabled ' : 'disabled';
                            console.log(`  [${status}] ${j.id}  "${j.prompt}"  (${j.schedule})`);
                        }
                    } catch (err) {
                        console.log(`error: ${err.message}`);
                    }
                } else if (sub === 'enable' && id) {
                    try {
                        const j = await postJson(`/v1/cron/jobs/${id}/enable`);
                        console.log(`enabled: ${j.id} — next run at ${j.nextRunAt}`);
                    } catch (err) {
                        console.log(`error: ${err.message}`);
                    }
                } else if (sub === 'disable' && id) {
                    try {
                        const j = await postJson(`/v1/cron/jobs/${id}/disable`);
                        console.log(`disabled: ${j.id}`);
                    } catch (err) {
                        console.log(`error: ${err.message}`);
                    }
                } else if (sub === 'run' && id) {
                    try {
                        await postJson(`/v1/cron/jobs/${id}/run`);
                        console.log(`ran: ${id}`);
                    } catch (err) {
                        console.log(`error: ${err.message}`);
                    }
                } else {
                    console.log('usage: :cron list | :cron enable <id> | :cron disable <id> | :cron run <id>');
                }
                continue;
            }

            if (line === ':status') {
                try {
                    const status = await getJson(`/v1/status?session=${encodeURIComponent(sessionId)}`);
                    console.log(`agent> ${JSON.stringify(status, null, 2)}`);
                } catch (err) {
                    console.log(`agent> error: ${err.message}`);
                }
                continue;
            }

            try {
                const res = await postJson('/v1/chat', { sessionId, message: line });
                const reply = res?.reply || res?.finalContent || res?.message || JSON.stringify(res, null, 2);
                console.log(`agent> ${reply}\n`);
            } catch (err) {
                console.log(`agent> error: ${err.message}\n`);
            }
        }
    } finally {
        rl.close();
        input.destroy();
    }

    console.log('bye');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
