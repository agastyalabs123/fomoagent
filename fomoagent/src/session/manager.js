/**
 * Session management — JSONL persistence, history windowing.
 * Mirrors nanobot's session/manager.py.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, safeFilename } from '../utils/helpers.js';

export class Session {
  constructor(key) {
    this.key = key;
    this.messages = [];
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.metadata = {};
    this.lastConsolidated = 0;
  }

  addMessage(role, content, extra = {}) {
    this.messages.push({
      role, content,
      timestamp: new Date().toISOString(),
      ...extra,
    });
    this.updatedAt = new Date();
  }

  getHistory(maxMessages = 500) {
    const unconsolidated = this.messages.slice(this.lastConsolidated);
    let sliced = maxMessages > 0 ? unconsolidated.slice(-maxMessages) : unconsolidated;

    // Drop leading non-user messages
    for (let i = 0; i < sliced.length; i++) {
      if (sliced[i].role === 'user') { sliced = sliced.slice(i); break; }
    }

    // Find legal tool-call boundary (no orphan tool results)
    const declared = new Set();
    let start = 0;
    for (let i = 0; i < sliced.length; i++) {
      const msg = sliced[i];
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (tc?.id) declared.add(tc.id);
        }
      } else if (msg.role === 'tool') {
        const tid = msg.tool_call_id;
        if (tid && !declared.has(tid)) {
          start = i + 1;
          declared.clear();
          // Re-scan from new start
          for (let j = start; j <= i; j++) {
            if (sliced[j].role === 'assistant' && sliced[j].tool_calls) {
              for (const tc of sliced[j].tool_calls) {
                if (tc?.id) declared.add(tc.id);
              }
            }
          }
        }
      }
    }
    if (start > 0) sliced = sliced.slice(start);

    return sliced.map(m => {
      const entry = { role: m.role, content: m.content ?? '' };
      for (const key of ['tool_calls', 'tool_call_id', 'name']) {
        if (key in m) entry[key] = m[key];
      }
      return entry;
    });
  }

  clear() {
    this.messages = [];
    this.lastConsolidated = 0;
    this.updatedAt = new Date();
  }
}

export class SessionManager {
  constructor(workspace) {
    this.workspace = workspace;
    this.sessionsDir = ensureDir(path.join(workspace, 'sessions'));
    this._cache = new Map();
  }

  _getPath(key) {
    return path.join(this.sessionsDir, `${safeFilename(key.replace(':', '_'))}.jsonl`);
  }

  getOrCreate(key) {
    if (this._cache.has(key)) return this._cache.get(key);
    const session = this._load(key) || new Session(key);
    this._cache.set(key, session);
    return session;
  }

  _load(key) {
    const p = this._getPath(key);
    if (!fs.existsSync(p)) return null;

    try {
      const lines = fs.readFileSync(p, 'utf-8').split('\n').filter(Boolean);
      const session = new Session(key);

      for (const line of lines) {
        const data = JSON.parse(line);
        if (data._type === 'metadata') {
          session.metadata = data.metadata || {};
          session.createdAt = data.created_at ? new Date(data.created_at) : new Date();
          session.lastConsolidated = data.last_consolidated || 0;
        } else {
          session.messages.push(data);
        }
      }

      return session;
    } catch (e) {
      console.warn(`Failed to load session ${key}: ${e.message}`);
      return null;
    }
  }

  save(session) {
    const p = this._getPath(session.key);
    const lines = [];

    lines.push(JSON.stringify({
      _type: 'metadata',
      key: session.key,
      created_at: session.createdAt.toISOString(),
      updated_at: session.updatedAt.toISOString(),
      metadata: session.metadata,
      last_consolidated: session.lastConsolidated,
    }));

    for (const msg of session.messages) {
      lines.push(JSON.stringify(msg));
    }

    fs.writeFileSync(p, lines.join('\n') + '\n', 'utf-8');
    this._cache.set(session.key, session);
  }

  invalidate(key) {
    this._cache.delete(key);
  }

  listSessions() {
    const sessions = [];
    try {
      for (const file of fs.readdirSync(this.sessionsDir)) {
        if (!file.endsWith('.jsonl')) continue;
        const p = path.join(this.sessionsDir, file);
        try {
          const firstLine = fs.readFileSync(p, 'utf-8').split('\n')[0];
          if (firstLine) {
            const data = JSON.parse(firstLine);
            if (data._type === 'metadata') {
              sessions.push({
                key: data.key || file.replace('.jsonl', '').replace('_', ':', 1),
                created_at: data.created_at,
                updated_at: data.updated_at,
              });
            }
          }
        } catch { /* skip */ }
      }
    } catch { /* dir might not exist */ }
    return sessions.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }
}
