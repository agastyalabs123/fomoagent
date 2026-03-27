/**
 * Base LLM provider interface.
 * Mirrors nanobot's providers/base.py.
 */

export class ToolCallRequest {
  constructor({ id, name, arguments: args }) {
    this.id = id;
    this.name = name;
    this.arguments = args || {};
  }

  toOpenAIToolCall() {
    return {
      id: this.id,
      type: 'function',
      function: { name: this.name, arguments: JSON.stringify(this.arguments) },
    };
  }
}

export class LLMResponse {
  constructor({ content = null, toolCalls = [], finishReason = 'stop', usage = {}, reasoningContent = null } = {}) {
    this.content = content;
    this.toolCalls = toolCalls;
    this.finishReason = finishReason;
    this.usage = usage;
    this.reasoningContent = reasoningContent;
  }

  get hasToolCalls() {
    return this.toolCalls.length > 0;
  }
}

const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000];
const TRANSIENT_MARKERS = ['429', 'rate limit', '500', '502', '503', '504', 'overloaded', 'timeout', 'timed out'];

function isTransient(content) {
  const lower = (content || '').toLowerCase();
  return TRANSIENT_MARKERS.some(m => lower.includes(m));
}

export class LLMProvider {
  constructor({ apiKey, apiBase } = {}) {
    this.apiKey = apiKey;
    this.apiBase = apiBase;
    this.generation = { temperature: 0.7, maxTokens: 4096, reasoningEffort: null };
    this.retryDelaysMs = DEFAULT_RETRY_DELAYS;
  }

  /** Override in subclass */
  async chat(/* { messages, tools, model, maxTokens, temperature } */) {
    throw new Error('chat() must be implemented');
  }

  /** Override in subclass for native streaming */
  async chatStream({ messages, tools, model, maxTokens, temperature, onContentDelta }) {
    const response = await this.chat({ messages, tools, model, maxTokens, temperature });
    if (onContentDelta && response.content) await onContentDelta(response.content);
    return response;
  }

  getDefaultModel() { return 'gpt-4o'; }

  async chatWithRetry({ messages, tools, model, maxTokens, temperature, reasoningEffort }) {
    maxTokens = maxTokens ?? this.generation.maxTokens;
    temperature = temperature ?? this.generation.temperature;

    const kw = { messages, tools, model, maxTokens, temperature, reasoningEffort };

    for (const delay of this.retryDelaysMs || DEFAULT_RETRY_DELAYS) {
      try {
        const resp = await this.chat(kw);
        if (resp.finishReason !== 'error') return resp;
        if (!isTransient(resp.content)) return resp;
        console.warn(`LLM transient error, retrying in ${delay}ms: ${(resp.content || '').slice(0, 120)}`);
      } catch (e) {
        if (!isTransient(e.message)) throw e;
        console.warn(`LLM transient error, retrying in ${delay}ms: ${e.message.slice(0, 120)}`);
      }
      await new Promise(r => setTimeout(r, delay));
    }

    return this.chat(kw);
  }

  async chatStreamWithRetry({ messages, tools, model, maxTokens, temperature, reasoningEffort, onContentDelta }) {
    maxTokens = maxTokens ?? this.generation.maxTokens;
    temperature = temperature ?? this.generation.temperature;

    const kw = { messages, tools, model, maxTokens, temperature, reasoningEffort, onContentDelta };

    for (const delay of this.retryDelaysMs || DEFAULT_RETRY_DELAYS) {
      try {
        const resp = await this.chatStream(kw);
        if (resp.finishReason !== 'error') return resp;
        if (!isTransient(resp.content)) return resp;
        console.warn(`LLM transient error (stream), retrying in ${delay}ms`);
      } catch (e) {
        if (!isTransient(e.message)) throw e;
        console.warn(`LLM transient error (stream), retrying in ${delay}ms`);
      }
      await new Promise(r => setTimeout(r, delay));
    }

    return this.chatStream(kw);
  }
}
