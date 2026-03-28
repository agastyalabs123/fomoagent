/**
 * OpenRouter free-tier provider — OpenAI-compatible REST API.
 * Used as a fallback when the primary provider (Gemini) returns a transient error.
 */

import { LLMProvider, LLMResponse, ToolCallRequest } from './base.js';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
// Let OpenRouter pick the best available free model dynamically.
const FALLBACK_FREE_MODEL = 'openrouter/free';

function shortId() {
  return Math.random().toString(36).slice(2, 11);
}

function messageContentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p) => (p?.type === 'text' ? p.text : '')).join('');
  }
  return '';
}

function mapMessagesToOpenAI(messages) {
  return (messages || []).map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id || shortId(), content: messageContentToText(m.content) };
    }
    const msg = { role: m.role, content: messageContentToText(m.content) || '' };
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      msg.tool_calls = m.tool_calls;
    }
    return msg;
  });
}

function mapToolsForOpenAI(tools) {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({ type: 'function', function: t.function }));
}

function parseToolCalls(rawCalls) {
  if (!Array.isArray(rawCalls)) return [];
  return rawCalls.map((tc) => {
    let args = {};
    try { args = JSON.parse(tc?.function?.arguments || '{}'); } catch { /* ignore */ }
    return new ToolCallRequest({ id: tc.id || shortId(), name: tc?.function?.name || '', arguments: args });
  });
}

export class OpenRouterFreeProvider extends LLMProvider {
  constructor({ apiKey, model, httpReferer = 'http://localhost', appTitle = 'fomoagent' } = {}) {
    super({ apiKey });
    this._apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    this._model = model || FALLBACK_FREE_MODEL;
    this._httpReferer = httpReferer;
    this._appTitle = appTitle;
  }

  getDefaultModel() { return this._model; }

  async _post(body) {
    const res = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._apiKey}`,
        'HTTP-Referer': this._httpReferer,
        'X-Title': this._appTitle,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  async chat({ messages, tools, maxTokens, temperature }) {
    try {
      // Never forward primary provider ids (e.g. gemini/gemini-2.5-flash-lite) — OpenRouter rejects them.
      const body = {
        model: this._model,
        messages: mapMessagesToOpenAI(messages),
        max_tokens: maxTokens || this.generation.maxTokens,
        temperature: temperature ?? this.generation.temperature,
      };
      const openAITools = mapToolsForOpenAI(tools);
      if (openAITools) body.tools = openAITools;

      const data = await this._post(body);
      const choice = data.choices?.[0];
      const msg = choice?.message;
      const toolCalls = parseToolCalls(msg?.tool_calls);
      const finishReason = (choice?.finish_reason || 'stop').toLowerCase();

      return new LLMResponse({
        content: msg?.content || null,
        toolCalls,
        finishReason: finishReason === 'stop' ? 'stop' : finishReason,
        usage: {
          prompt_tokens: data.usage?.prompt_tokens || 0,
          completion_tokens: data.usage?.completion_tokens || 0,
        },
        reasoningContent: null,
      });
    } catch (e) {
      return new LLMResponse({ content: `OpenRouter fallback error: ${e.message}`, finishReason: 'error' });
    }
  }
}
