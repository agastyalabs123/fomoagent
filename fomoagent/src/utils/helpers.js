/**
 * Utility functions.
 * Mirrors nanobot's utils/helpers.py.
 */

import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function safeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

export function stripThink(text) {
  if (!text) return '';
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  text = text.replace(/<think>[\s\S]*$/g, '');
  return text.trim();
}

export function currentTimeStr(timezone) {
  const now = new Date();
  const options = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    weekday: 'long',
    timeZone: timezone || undefined,
    timeZoneName: 'short',
  };
  try {
    return now.toLocaleString('en-US', options);
  } catch {
    return now.toISOString();
  }
}

export function splitMessage(content, maxLen = 2000) {
  if (!content) return [];
  if (content.length <= maxLen) return [content];
  const chunks = [];
  while (content.length > 0) {
    if (content.length <= maxLen) { chunks.push(content); break; }
    const cut = content.slice(0, maxLen);
    let pos = cut.lastIndexOf('\n');
    if (pos <= 0) pos = cut.lastIndexOf(' ');
    if (pos <= 0) pos = maxLen;
    chunks.push(content.slice(0, pos));
    content = content.slice(pos).trimStart();
  }
  return chunks;
}

export function buildAssistantMessage(content, { toolCalls, reasoningContent } = {}) {
  const msg = { role: 'assistant', content };
  if (toolCalls?.length) msg.tool_calls = toolCalls;
  if (reasoningContent) msg.reasoning_content = reasoningContent;
  return msg;
}

/**
 * Very rough token estimator — 4 chars per token.
 * Good enough for context window management.
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(msg) {
  let text = '';
  const content = msg.content;
  if (typeof content === 'string') text += content;
  else if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === 'object' && part.type === 'text') text += part.text || '';
    }
  }
  if (msg.tool_calls) text += JSON.stringify(msg.tool_calls);
  if (msg.reasoning_content) text += msg.reasoning_content;
  return Math.max(4, estimateTokens(text) + 4);
}

export function estimatePromptTokens(messages, tools) {
  let total = 0;
  for (const msg of messages) total += estimateMessageTokens(msg);
  if (tools?.length) total += estimateTokens(JSON.stringify(tools));
  total += messages.length * 4; // per-message overhead
  return total;
}
