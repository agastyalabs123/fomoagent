/**
 * OpenAI-compatible provider using the official OpenAI SDK.
 * Mirrors nanobot's providers/openai_compat_provider.py.
 */

import OpenAI from 'openai';
import { LLMProvider, LLMResponse, ToolCallRequest } from './base.js';

function shortToolId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 9; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

export class OpenAICompatibleProvider extends LLMProvider {
  constructor({ apiKey, apiBase, defaultModel = 'gpt-4o', spec = null } = {}) {
    super({ apiKey, apiBase });
    this.defaultModel = defaultModel;
    this._spec = spec;

    // Set env vars for provider if needed
    if (apiKey && spec?.envKey) {
      process.env[spec.envKey] = process.env[spec.envKey] || apiKey;
    }

    const effectiveBase = apiBase || spec?.defaultApiBase || undefined;
    this._client = new OpenAI({
      apiKey: apiKey || 'no-key',
      baseURL: effectiveBase,
    });
  }

  _buildKwargs({ messages, tools, model, maxTokens, temperature, reasoningEffort }) {
    let modelName = model || this.defaultModel;

    // Strip provider prefix for gateways that don't understand it
    if (this._spec?.stripModelPrefix) {
      modelName = modelName.split('/').pop();
    }

    const kwargs = {
      model: modelName,
      messages: this._sanitizeMessages(messages),
      max_tokens: Math.max(1, maxTokens || this.generation.maxTokens),
      temperature: temperature ?? this.generation.temperature,
    };

    if (reasoningEffort) kwargs.reasoning_effort = reasoningEffort;

    if (tools?.length) {
      kwargs.tools = tools;
      kwargs.tool_choice = 'auto';
    }

    return kwargs;
  }

  _sanitizeMessages(messages) {
    const ALLOWED = new Set(['role', 'content', 'tool_calls', 'tool_call_id', 'name']);
    return messages.map(msg => {
      const clean = {};
      for (const [k, v] of Object.entries(msg)) {
        if (ALLOWED.has(k)) clean[k] = v;
      }
      // Ensure assistant messages have content
      if (clean.role === 'assistant' && !('content' in clean)) clean.content = null;
      // Fix empty content
      if (clean.content === '' && clean.role === 'assistant' && clean.tool_calls) {
        clean.content = null;
      } else if (clean.content === '') {
        clean.content = '(empty)';
      }
      return clean;
    });
  }

  _parseResponse(response) {
    if (!response.choices?.length) {
      return new LLMResponse({ content: 'Error: API returned empty choices.', finishReason: 'error' });
    }

    const choice = response.choices[0];
    const msg = choice.message;
    const content = msg?.content || null;
    const finishReason = choice.finish_reason || 'stop';

    const toolCalls = (msg?.tool_calls || []).map(tc => {
      const args = typeof tc.function.arguments === 'string'
        ? safeJsonParse(tc.function.arguments)
        : tc.function.arguments || {};
      return new ToolCallRequest({ id: shortToolId(), name: tc.function.name, arguments: args });
    });

    return new LLMResponse({
      content,
      toolCalls,
      finishReason,
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
      return new LLMResponse({ content: `Error calling LLM: ${e.message}`, finishReason: 'error' });
    }
  }

  async chatStream({ messages, tools, model, maxTokens, temperature, reasoningEffort, onContentDelta }) {
    const kwargs = this._buildKwargs({ messages, tools, model, maxTokens, temperature, reasoningEffort });
    kwargs.stream = true;

    try {
      const stream = await this._client.chat.completions.create(kwargs);

      const contentParts = [];
      const tcBufs = new Map(); // index -> { id, name, arguments }
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

      const toolCalls = [...tcBufs.values()].map(buf =>
        new ToolCallRequest({
          id: buf.id || shortToolId(),
          name: buf.name,
          arguments: buf.arguments ? safeJsonParse(buf.arguments) : {},
        })
      );

      return new LLMResponse({
        content: contentParts.join('') || null,
        toolCalls,
        finishReason,
        usage,
      });
    } catch (e) {
      return new LLMResponse({ content: `Error calling LLM: ${e.message}`, finishReason: 'error' });
    }
  }

  getDefaultModel() { return this.defaultModel; }
}
