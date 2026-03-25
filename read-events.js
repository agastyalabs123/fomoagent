import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error('DATABASE_URL is not set. Check your .env file.');
    process.exit(1);
}
const adapter = new PrismaLibSql({ url: dbUrl });
const prisma = new PrismaClient({ adapter });

async function readAllEvents() {
    const events = await prisma.event.findMany({
        orderBy: { startDate: 'asc' },
    });
    return events;
}

async function readEventsBySource(source) {
    const events = await prisma.event.findMany({
        where: { source },
        orderBy: { startDate: 'asc' },
    });
    return events;
}

async function searchEvents(query) {
    const events = await prisma.event.findMany({
        where: {
            OR: [
                { name: { contains: query } },
                { location: { contains: query } },
                { description: { contains: query } },
            ],
        },
        orderBy: { startDate: 'asc' },
    });
    return events;
}

async function main() {
    const arg = process.argv[2];
    const value = process.argv[3];

    let events;

    if (arg === '--source' && value) {
        events = await readEventsBySource(value);
        console.log(`\nEvents from "${value}":`);
    } else if (arg === '--search' && value) {
        events = await searchEvents(value);
        console.log(`\nEvents matching "${value}":`);
    } else {
        events = await readAllEvents();
        console.log('\nAll events:');
    }

    if (events.length === 0) {
        console.log('No events found.');
    } else {
        for (const e of events) {
            console.log(`  [${e.source}] ${e.name} — ${e.startDate ?? 'TBD'} @ ${e.location ?? 'TBD'}`);
        }
        console.log(`\nTotal: ${events.length} events`);
    }

    await prisma.$disconnect();
}

main();
