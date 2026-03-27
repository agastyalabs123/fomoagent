import fs from 'node:fs';
import path from 'node:path';

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export class CronStore {
  constructor(workspace) {
    const dir = ensureDir(path.join(workspace, 'cron'));
    this.file = path.join(dir, 'jobs.json');
  }

  load() {
    if (!fs.existsSync(this.file)) return { jobs: [] };
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf-8'));
    } catch {
      return { jobs: [] };
    }
  }

  save(data) {
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf-8');
  }
}
