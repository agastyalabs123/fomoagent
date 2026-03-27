import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CronService } from '../src/cron/service.js';

test('cron create/list/disable flow persists', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'fomoagent-cron-'));
  const ran = [];
  const cron = new CronService({
    workspace,
    tickSeconds: 1,
    onRunJob: async ({ sessionId, message }) => {
      ran.push({ sessionId, message });
      return { stopReason: 'completed' };
    },
  });
  const job = cron.addJob({
    sessionId: 'api:test',
    prompt: 'hello',
    schedule: 'every 1 seconds',
  });
  assert.ok(job.id);
  assert.equal(cron.listJobs().length, 1);
  cron.setEnabled(job.id, false);
  assert.equal(cron.listJobs()[0].enabled, false);
});
