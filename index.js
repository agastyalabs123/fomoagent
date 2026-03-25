import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error('DATABASE_URL is not set. Check your .env file.');
    process.exit(1);
}
const adapter = new PrismaLibSql({ url: dbUrl });
const prisma = new PrismaClient({ adapter });

const app = express();
const PORT = process.env.PORT || 3000;

function timestampToString(ts) {
    if (ts === null || ts === undefined) return null;
    return new Date(ts * 1000).toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
    });
}

app.get('/events', async (_req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const events = await prisma.event.findMany({
        where: { startDate: { gte: now } },
        orderBy: { startDate: 'asc' },
    });
    const formatted = events.map(e => ({
        ...e,
        startDateFormatted: timestampToString(e.startDate),
        endDateFormatted: timestampToString(e.endDate),
    }));
    res.json(formatted);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`GET http://localhost:${PORT}/events`);
});
