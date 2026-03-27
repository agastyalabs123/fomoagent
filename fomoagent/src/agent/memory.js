/**
 * Memory system — persistent MEMORY.md + HISTORY.md.
 * Mirrors nanobot's agent/memory.py.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, estimateMessageTokens, estimatePromptTokens } from '../utils/helpers.js';

const SAVE_MEMORY_TOOL = [{
  type: 'function',
  function: {
    name: 'save_memory',
    description: 'Save the memory consolidation result to persistent storage.',
    parameters: {
      type: 'object',
      properties: {
        history_entry: {
          type: 'string',
          description: 'A paragraph summarizing key events. Start with [YYYY-MM-DD HH:MM].',
        },
        memory_update: {
          type: 'string',
          description: 'Full updated long-term memory as markdown.',
        },
      },
      required: ['history_entry', 'memory_update'],
    },
  },
}];

export class MemoryStore {
  constructor(workspace) {
    this.memoryDir = ensureDir(path.join(workspace, 'memory'));
    this.memoryFile = path.join(this.memoryDir, 'MEMORY.md');
    this.historyFile = path.join(this.memoryDir, 'HISTORY.md');
  }

  readLongTerm() {
    if (fs.existsSync(this.memoryFile)) return fs.readFileSync(this.memoryFile, 'utf-8');
    return '';
  }

  writeLongTerm(content) {
    fs.writeFileSync(this.memoryFile, content, 'utf-8');
  }

  appendHistory(entry) {
    fs.appendFileSync(this.historyFile, entry.trimEnd() + '\n\n', 'utf-8');
  }

  getMemoryContext() {
    const lt = this.readLongTerm();
    return lt ? `## Long-term Memory\n${lt}` : '';
  }

  static formatMessages(messages) {
    return messages
      .filter(m => m.content)
      .map(m => {
        const ts = (m.timestamp || '?').slice(0, 16);
        return `[${ts}] ${(m.role || '').toUpperCase()}: ${m.content}`;
      })
      .join('\n');
  }

  async consolidate(messages, provider, model) {
    if (!messages.length) return true;

    const currentMemory = this.readLongTerm();
    const prompt = `Process this conversation and call the save_memory tool with your consolidation.

## Current Long-term Memory
${currentMemory || '(empty)'}

## Conversation to Process
${MemoryStore.formatMessages(messages)}`;

    const chatMessages = [
      { role: 'system', content: 'You are a memory consolidation agent. Call the save_memory tool with your consolidation of the conversation.' },
      { role: 'user', content: prompt },
    ];

    try {
      const response = await provider.chatWithRetry({
        messages: chatMessages,
        tools: SAVE_MEMORY_TOOL,
        model,
      });

      if (!response.hasToolCalls) {
        console.warn('Memory consolidation: LLM did not call save_memory');
        this._rawArchive(messages);
        return true;
      }

      const args = response.toolCalls[0].arguments;
      if (!args?.history_entry || !args?.memory_update) {
        console.warn('Memory consolidation: missing required fields');
        this._rawArchive(messages);
        return true;
      }

      this.appendHistory(String(args.history_entry).trim());
      const update = String(args.memory_update);
      if (update !== currentMemory) this.writeLongTerm(update);

      console.log(`Memory consolidation done for ${messages.length} messages`);
      return true;
    } catch (e) {
      console.error('Memory consolidation failed:', e.message);
      this._rawArchive(messages);
      return true;
    }
  }

  _rawArchive(messages) {
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
    this.appendHistory(`[${ts}] [RAW] ${messages.length} messages\n${MemoryStore.formatMessages(messages)}`);
  }
}

export class MemoryConsolidator {
  constructor({ workspace, provider, model, sessions, contextWindowTokens, buildMessages, getToolDefinitions, maxCompletionTokens = 4096 }) {
    this.store = new MemoryStore(workspace);
    this.provider = provider;
    this.model = model;
    this.sessions = sessions;
    this.contextWindowTokens = contextWindowTokens;
    this.maxCompletionTokens = maxCompletionTokens;
    this._buildMessages = buildMessages;
    this._getToolDefinitions = getToolDefinitions;
    this._locks = new Map();
  }

  _getLock(key) {
    if (!this._locks.has(key)) {
      this._locks.set(key, { locked: false, queue: [] });
    }
    return this._locks.get(key);
  }

  async _withLock(key, fn) {
    const lock = this._getLock(key);
    if (lock.locked) {
      await new Promise(resolve => lock.queue.push(resolve));
    }
    lock.locked = true;
    try {
      return await fn();
    } finally {
      lock.locked = false;
      if (lock.queue.length) lock.queue.shift()();
    }
  }

  estimateSessionPromptTokens(session) {
    const history = session.getHistory(0);
    const [channel, chatId] = session.key.includes(':') ? session.key.split(':', 2) : [null, null];
    const probeMessages = this._buildMessages({
      history, currentMessage: '[token-probe]', channel, chatId,
    });
    return estimatePromptTokens(probeMessages, this._getToolDefinitions());
  }

  async maybeConsolidateByTokens(session) {
    if (!session.messages.length || this.contextWindowTokens <= 0) return;

    await this._withLock(session.key, async () => {
      const budget = this.contextWindowTokens - this.maxCompletionTokens - 1024;
      const target = Math.floor(budget / 2);
      let estimated = this.estimateSessionPromptTokens(session);
      if (estimated <= 0 || estimated < budget) return;

      for (let round = 0; round < 5; round++) {
        if (estimated <= target) return;

        const boundary = this._pickBoundary(session, Math.max(1, estimated - target));
        if (!boundary) return;

        const chunk = session.messages.slice(session.lastConsolidated, boundary);
        if (!chunk.length) return;

        console.log(`Token consolidation round ${round} for ${session.key}: ${estimated}/${this.contextWindowTokens}`);
        await this.store.consolidate(chunk, this.provider, this.model);
        session.lastConsolidated = boundary;
        this.sessions.save(session);

        estimated = this.estimateSessionPromptTokens(session);
        if (estimated <= 0) return;
      }
    });
  }

  _pickBoundary(session, tokensToRemove) {
    const start = session.lastConsolidated;
    if (start >= session.messages.length || tokensToRemove <= 0) return null;

    let removed = 0;
    let lastBoundary = null;
    for (let i = start; i < session.messages.length; i++) {
      if (i > start && session.messages[i].role === 'user') {
        lastBoundary = i;
        if (removed >= tokensToRemove) return i;
      }
      removed += estimateMessageTokens(session.messages[i]);
    }
    return lastBoundary;
  }
}
