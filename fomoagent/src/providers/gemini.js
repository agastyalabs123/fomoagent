import OpenAI from 'openai';
import { LLMProvider, LLMResponse, ToolCallRequest } from './base.js';

// ---------------------------------------------------------------------------
// Fix 1 — Base URL normalization
// Ported from openclaw/src/infra/google-api-base-url.ts
// Gemini rejects bare-hostname URLs and URLs with trailing slashes.
// ---------------------------------------------------------------------------

const GEMINI_DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_OPENAI_COMPAT_SUFFIX = '/openai/';

function normalizeGeminiBaseUrl(url) {
  const raw = (url || GEMINI_DEFAULT_BASE).trim().replace(/\/+$/, '');
  let normalized;
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    parsed.search = '';
    if (
      parsed.hostname.toLowerCase() === 'generativelanguage.googleapis.com' &&
      parsed.pathname.replace(/\/+$/, '') === ''
    ) {
      parsed.pathname = '/v1beta';
    }
    normalized = parsed.toString().replace(/\/+$/, '');
  } catch {
    normalized = /^https:\/\/generativelanguage\.googleapis\.com\/?$/i.test(raw)
      ? GEMINI_DEFAULT_BASE
      : raw;
  }
  // Append the OpenAI-compat suffix so fomoagent talks to the /openai/ endpoint.
  if (!normalized.endsWith('/openai')) {
    normalized = normalized + GEMINI_OPENAI_COMPAT_SUFFIX;
  } else {
    normalized = normalized + '/';
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Fix 2 — Tool schema sanitization
// Ported from openclaw/src/agents/pi-tools.schema.ts (cleanSchemaForGemini)
// Gemini returns 400 for tool schemas containing these JSON Schema keywords.
// ---------------------------------------------------------------------------

const GEMINI_UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  'patternProperties',
  'additionalProperties',
  '$schema',
  '$id',
  '$ref',
  '$defs',
  'definitions',
  'examples',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'multipleOf',
  'pattern',
  'format',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
]);

function stripGeminiUnsupportedKeywords(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(stripGeminiUnsupportedKeywords);
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (GEMINI_UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) continue;
    out[key] = stripGeminiUnsupportedKeywords(value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fix 3 — Turn ordering fix
// Ported from openclaw/src/agents/pi-embedded-runner/google.ts
// Gemini rejects a conversation whose first non-system message is assistant.
// ---------------------------------------------------------------------------

function fixGeminiTurnOrdering(messages) {
  const firstNonSystem = messages.find((m) => m.role !== 'system');
  if (!firstNonSystem || firstNonSystem.role !== 'assistant') return messages;
  return [{ role: 'user', content: '[conversation start]' }, ...messages];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortToolId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 9; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

/** OpenAI SDK / fetch errors often carry status on `e.status` or nested `error`. */
function formatGeminiApiError(e) {
  const status = e?.status ?? e?.response?.status;
  const apiMsg =
    e?.error?.message ||
    e?.error?.code ||
    (typeof e?.message === 'string' ? e.message : null) ||
    String(e);
  const hint429 =
    'Google Gemini rate limit or quota (HTTP 429). Wait 1–2 minutes and retry. ' +
    'If this persists: enable billing in Google Cloud for the Generative Language API, ' +
    'check quotas in Google AI Studio, or switch to a model with higher free-tier limits. ' +
    'See https://ai.google.dev/gemini-api/docs/rate-limits';
  if (status === 429) {
    return `Error calling LLM: ${hint429} (${apiMsg})`;
  }
  if (status) {
    return `Error calling LLM: HTTP ${status} — ${apiMsg}`;
  }
  return `Error calling LLM: ${apiMsg}`;
}

// ---------------------------------------------------------------------------
// GeminiProvider
// ---------------------------------------------------------------------------

export class GeminiProvider extends LLMProvider {
  constructor({ apiKey, apiBase, defaultModel = 'gemini/gemini-2.0-flash', spec = null } = {}) {
    super({ apiKey, apiBase });
    this.defaultModel = defaultModel;
    this._spec = spec;

    if (apiKey && spec?.envKey) {
      process.env[spec.envKey] = process.env[spec.envKey] || apiKey;
    }

    // Fix 1: normalize the base URL before passing to the OpenAI client.
    const effectiveBase = normalizeGeminiBaseUrl(apiBase || spec?.defaultApiBase);
    this._client = new OpenAI({
      apiKey: apiKey || 'no-key',
      baseURL: effectiveBase,
    });
  }

  _sanitizeMessages(messages) {
    const ALLOWED = new Set(['role', 'content', 'tool_calls', 'tool_call_id', 'name']);

    // Fix 3: ensure the first non-system message is always from the user.
    const ordered = fixGeminiTurnOrdering(messages);

    return ordered.map((msg) => {
      const clean = {};
      for (const [k, v] of Object.entries(msg)) {
        if (ALLOWED.has(k)) clean[k] = v;
      }
      if (clean.role === 'assistant' && !('content' in clean)) clean.content = null;
      if (clean.content === '' && clean.role === 'assistant' && clean.tool_calls) clean.content = null;
      else if (clean.content === '') clean.content = '(empty)';
      return clean;
    });
  }

  _buildKwargs({ messages, tools, model, maxTokens, temperature, reasoningEffort }) {
    const rawModel = model || this.defaultModel;
    // Gemini OpenAI-compat endpoint expects bare model id, e.g. "gemini-2.0-flash"
    // Config stores it as "gemini/gemini-2.0-flash" — strip the provider prefix.
    const resolvedModel = rawModel.replace(/^gemini\//, '');
    const kwargs = {
      model: resolvedModel,
      messages: this._sanitizeMessages(messages),
      max_tokens: Math.max(1, maxTokens || this.generation.maxTokens),
      temperature: temperature ?? this.generation.temperature,
    };
    if (reasoningEffort) kwargs.reasoning_effort = reasoningEffort;
    if (tools?.length) {
      // Fix 2: strip unsupported JSON Schema keywords from tool parameter schemas.
      kwargs.tools = tools.map((t) => ({
        ...t,
        function: {
          ...t.function,
          parameters: stripGeminiUnsupportedKeywords(t.function?.parameters),
        },
      }));
      kwargs.tool_choice = 'auto';
    }
    return kwargs;
  }

  _parseResponse(response) {
    if (!response.choices?.length) {
      return new LLMResponse({ content: 'Error: API returned empty choices.', finishReason: 'error' });
    }
    const choice = response.choices[0];
    const msg = choice.message;
    const toolCalls = (msg?.tool_calls || []).map((tc) => {
      const args = typeof tc.function.arguments === 'string'
        ? safeJsonParse(tc.function.arguments)
        : tc.function.arguments || {};
      return new ToolCallRequest({ id: shortToolId(), name: tc.function.name, arguments: args });
    });
    return new LLMResponse({
      content: msg?.content || null,
      toolCalls,
      finishReason: choice.finish_reason || 'stop',
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
      },
      reasoningContent: msg?.reasoning_content || null,
    });
  }

  async chat({ messages, tools, model, maxTokens, temperature, reasoningEffort }) {
    const kwargs = this._buildKwargs({ messages, tools, model, maxTokens, temperature, reasoningEffort });
    try {
      const response = await this._client.chat.completions.create(kwargs);
      return this._parseResponse(response);
    } catch (e) {
      return new LLMResponse({ content: formatGeminiApiError(e), finishReason: 'error' });
    }
  }

  async chatStream({ messages, tools, model, maxTokens, temperature, reasoningEffort, onContentDelta }) {
    const kwargs = this._buildKwargs({ messages, tools, model, maxTokens, temperature, reasoningEffort });
    kwargs.stream = true;
    try {
      const stream = await this._client.chat.completions.create(kwargs);
      const contentParts = [];
      const tcBufs = new Map();
      let finishReason = 'stop';
      let usage = {};

      for await (const chunk of stream) {
        if (chunk.usage) {
          usage = {
            prompt_tokens: chunk.usage.prompt_tokens || 0,
            completion_tokens: chunk.usage.completion_tokens || 0,
          };
        }
        if (!chunk.choices?.length) continue;
        const choice = chunk.choices[0];
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const delta = choice.delta;
        if (!delta) continue;

        if (delta.content) {
          contentParts.push(delta.content);
          if (onContentDelta) await onContentDelta(delta.content);
        }
        for (const tc of delta.tool_calls || []) {
          const idx = tc.index ?? 0;
          if (!tcBufs.has(idx)) tcBufs.set(idx, { id: '', name: '', arguments: '' });
          const buf = tcBufs.get(idx);
          if (tc.id) buf.id = tc.id;
          if (tc.function?.name) buf.name = tc.function.name;
          if (tc.function?.arguments) buf.arguments += tc.function.arguments;
        }
      }

      const toolCalls = [...tcBufs.values()].map((buf) => new ToolCallRequest({
        id: buf.id || shortToolId(),
        name: buf.name,
        arguments: buf.arguments ? safeJsonParse(buf.arguments) : {},
      }));

      return new LLMResponse({
        content: contentParts.join('') || null,
        toolCalls,
        finishReason,
        usage,
      });
    } catch (e) {
      return new LLMResponse({ content: formatGeminiApiError(e), finishReason: 'error' });
    }
  }

  getDefaultModel() { return this.defaultModel; }
}
