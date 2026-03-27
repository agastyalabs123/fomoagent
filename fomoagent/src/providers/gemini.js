import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMProvider, LLMResponse, ToolCallRequest } from './base.js';

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

function shortToolId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 9; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

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

function messageContentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part?.type === 'text' ? part.text : ''))
      .join('');
  }
  return '';
}

function normalizeModelName(model) {
  return (model || 'gemini-2.5-flash-lite').replace(/^gemini\//, '');
}

function coerceToolResponsePayload(content) {
  if (typeof content !== 'string') return { output: content ?? '' };
  const trimmed = content.trim();
  if (!trimmed) return { output: '' };
  try {
    return JSON.parse(trimmed);
  } catch {
    return { output: content };
  }
}

function extractFunctionCalls(response) {
  const fromHelper = response?.functionCalls?.();
  if (Array.isArray(fromHelper) && fromHelper.length) return fromHelper;
  const parts = response?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => p?.functionCall)
    .filter(Boolean);
}

function mapToolsForGemini(tools) {
  if (!tools?.length) return undefined;
  const declarations = tools.map((t) => ({
    name: t.function?.name,
    description: t.function?.description,
    parameters: stripGeminiUnsupportedKeywords(t.function?.parameters || { type: 'object', properties: {} }),
  }));
  return [{ functionDeclarations: declarations }];
}

function mapMessagesToGemini(messages) {
  const mapped = [];
  for (const msg of messages || []) {
    if (!msg || msg.role === 'system') continue;
    if (msg.role === 'tool') {
      mapped.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: msg.name || 'tool',
            response: coerceToolResponsePayload(msg.content),
          },
        }],
      });
      continue;
    }

    const parts = [];
    const text = messageContentToText(msg.content);
    if (text) parts.push({ text });

    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        const args = typeof tc?.function?.arguments === 'string'
          ? safeJsonParse(tc.function.arguments)
          : tc?.function?.arguments || {};
        parts.push({
          functionCall: {
            name: tc?.function?.name || '',
            args,
          },
        });
      }
    }

    if (!parts.length) parts.push({ text: '(empty)' });
    mapped.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts });
  }

  if (!mapped.length || mapped[0].role === 'model') {
    mapped.unshift({ role: 'user', parts: [{ text: '[conversation start]' }] });
  }
  return mapped;
}

export class GeminiProvider extends LLMProvider {
  constructor({ apiKey, apiBase, defaultModel = 'gemini/gemini-2.5-flash-lite', spec = null } = {}) {
    super({ apiKey, apiBase });
    this.defaultModel = defaultModel;
    this._spec = spec;
    this._apiKey = apiKey || process.env.GEMINI_API_KEY || '';

    if (this._apiKey && spec?.envKey) {
      process.env[spec.envKey] = process.env[spec.envKey] || this._apiKey;
    }
    this._client = new GoogleGenerativeAI(this._apiKey);
  }

  _getSystemInstruction(messages) {
    const parts = (messages || [])
      .filter((m) => m?.role === 'system' && m.content)
      .map((m) => messageContentToText(m.content))
      .filter(Boolean);
    return parts.length ? parts.join('\n\n') : undefined;
  }

  _makeModel({ messages, tools, model }) {
    return this._client.getGenerativeModel({
      model: normalizeModelName(model || this.defaultModel),
      systemInstruction: this._getSystemInstruction(messages),
      tools: mapToolsForGemini(tools),
    });
  }

  _parseResponse(response) {
    const functionCalls = extractFunctionCalls(response);
    const toolCalls = functionCalls.map((fc) => {
      const args = typeof fc?.args === 'string' ? safeJsonParse(fc.args) : (fc?.args || {});
      return new ToolCallRequest({ id: shortToolId(), name: fc?.name || '', arguments: args });
    });
    const text = (typeof response?.text === 'function' ? response.text() : '') || null;
    const finish = (response?.candidates?.[0]?.finishReason || 'STOP').toLowerCase();
    const usageMeta = response?.usageMetadata || {};
    return new LLMResponse({
      content: text,
      toolCalls,
      finishReason: finish === 'stop' ? 'stop' : finish,
      usage: {
        prompt_tokens: usageMeta.promptTokenCount || 0,
        completion_tokens: usageMeta.candidatesTokenCount || 0,
      },
      reasoningContent: null,
    });
  }

  async chat({ messages, tools, model, maxTokens, temperature, reasoningEffort: _reasoningEffort }) {
    try {
      const geminiModel = this._makeModel({ messages, tools, model });
      const result = await geminiModel.generateContent({
        contents: mapMessagesToGemini(messages),
        generationConfig: {
          maxOutputTokens: Math.max(1, maxTokens || this.generation.maxTokens),
          temperature: temperature ?? this.generation.temperature,
        },
      });
      return this._parseResponse(result.response);
    } catch (e) {
      return new LLMResponse({ content: formatGeminiApiError(e), finishReason: 'error' });
    }
  }

  async chatStream({ messages, tools, model, maxTokens, temperature, reasoningEffort: _reasoningEffort, onContentDelta }) {
    try {
      const geminiModel = this._makeModel({ messages, tools, model });
      const streamResult = await geminiModel.generateContentStream({
        contents: mapMessagesToGemini(messages),
        generationConfig: {
          maxOutputTokens: Math.max(1, maxTokens || this.generation.maxTokens),
          temperature: temperature ?? this.generation.temperature,
        },
      });
      for await (const chunk of streamResult.stream) {
        const delta = typeof chunk?.text === 'function' ? chunk.text() : '';
        if (delta && onContentDelta) await onContentDelta(delta);
      }
      const finalResponse = await streamResult.response;
      return this._parseResponse(finalResponse);
    } catch (e) {
      // Streaming fallback: if native stream fails, retry once with non-stream call contract.
      const fallback = await this.chat({ messages, tools, model, maxTokens, temperature, reasoningEffort: _reasoningEffort });
      if (fallback.finishReason === 'error') {
        return new LLMResponse({ content: formatGeminiApiError(e), finishReason: 'error' });
      }
      if (onContentDelta && fallback.content) await onContentDelta(fallback.content);
      return fallback;
    }
  }

  getDefaultModel() { return this.defaultModel; }
}
