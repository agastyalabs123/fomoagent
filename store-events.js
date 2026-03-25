import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error('DATABASE_URL is not set. Check your .env file.');
    process.exit(1);
}
const adapter = new PrismaLibSql({ url: dbUrl });
const prisma = new PrismaClient({ adapter });

function normalizeDateInput(s) {
    if (!s || typeof s !== 'string') return null;
    return s.split('(')[0].trim();
}

function parseEventDate(s) {
    const raw = normalizeDateInput(s);
    if (!raw) return null;

    // "Tue, May 5" / "Wed, Mar 25" — no year, so infer current year
    // Must check BEFORE Date.parse, which mis-parses these as year 2001
    const m2 = raw.match(/^[A-Za-z]{3},\s*([A-Za-z]{3,})\s+(\d{1,2})$/);
    if (m2) {
        const year = new Date().getFullYear();
        const d = Date.parse(`${m2[1]} ${m2[2]}, ${year}`);
        if (!Number.isNaN(d)) return new Date(d);
    }

    // "23 Mar 2026"
    const m1 = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
    if (m1) {
        const d = Date.parse(`${m1[2]} ${m1[1]}, ${m1[3]}`);
        if (!Number.isNaN(d)) return new Date(d);
    }

    // ISO / "Month D, YYYY" / "March 25, 2026" etc.
    const native = Date.parse(raw);
    if (!Number.isNaN(native)) return new Date(native);

    return null;
}

function toTimestamp(s) {
    const d = parseEventDate(s);
    return d ? Math.floor(d.getTime() / 1000) : null;
}

function isUpcomingEvent(e) {
    if (e.startDate === null) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return e.startDate >= Math.floor(today.getTime() / 1000);
}

async function loadEventsJson() {
    const p = new URL('./events.json', import.meta.url);
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
}

function flattenFromEventsJson(data) {
    const events = [];

    for (const e of data?.solana?.events ?? []) {
        events.push({
            name: e.name,
            description: e.description ?? null,
            startDate: toTimestamp(e.start_date),
            endDate: toTimestamp(e.end_date),
            time: e.time ?? null,
            location: e.location ?? null,
            source: 'solana',
            category: null,
        });
    }

    for (const e of data?.cryptoNomads?.events ?? []) {
        events.push({
            name: e.name,
            description: e.description ?? null,
            startDate: toTimestamp(e.start_date),
            endDate: toTimestamp(e.end_date),
            time: e.time ?? null,
            location: e.location ?? null,
            source: 'cryptoNomads',
            category: null,
        });
    }

    // already "upcoming" in the json, but we'll still date-filter below
    for (const e of data?.ethGlobal?.upcoming_events ?? []) {
        events.push({
            name: e.name,
            description: e.description ?? null,
            startDate: toTimestamp(e.start_date),
            endDate: toTimestamp(e.end_date),
            time: e.time ?? null,
            location: e.location ?? null,
            source: 'ethGlobal',
            category: 'upcoming',
        });
    }

    return events;
}

async function main() {
    const data = await loadEventsJson();
    const allEvents = flattenFromEventsJson(data);
    const upcomingEvents = allEvents.filter(isUpcomingEvent);

    console.log(`\nStoring ${upcomingEvents.length} upcoming events in SQLite...`);

    for (const event of upcomingEvents) {
        await prisma.event.upsert({
            where: {
                name_startDate_source: {
                    name: event.name,
                    startDate: event.startDate ?? 0,
                    source: event.source,
                },
            },
            update: {
                description: event.description,
                time: event.time,
                location: event.location,
                category: event.category,
            },
            create: event,
        });
    }

    const count = await prisma.event.count();
    console.log(`Done! ${count} total events in database.`);

    await prisma.$disconnect();
}

main();
