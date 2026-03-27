import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMResponse, ToolCallRequest } from './base.js';

function toAnthropicMessages(messages) {
  const out = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    if (msg.role === 'tool') {
      out.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: msg.tool_call_id, content: String(msg.content || '') }],
      });
      continue;
    }
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      const blocks = [];
      if (msg.content) blocks.push({ type: 'text', text: msg.content });
      for (const tc of msg.tool_calls) {
        const args = typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments || '{}') : tc.function?.arguments || {};
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function?.name, input: args });
      }
      out.push({ role: 'assistant', content: blocks });
      continue;
    }
    out.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: String(msg.content || '') });
  }
  return out;
}

export class AnthropicProvider extends LLMProvider {
  constructor({ apiKey, defaultModel }) {
    super({ apiKey });
    this.defaultModel = defaultModel;
    this.client = new Anthropic({ apiKey });
  }

  async chat({ messages, tools, model, maxTokens, temperature }) {
    const system = messages.find((m) => m.role === 'system')?.content || '';
    const toolDefs = (tools || []).map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters || { type: 'object', properties: {} },
    }));
    try {
      const response = await this.client.messages.create({
        model: model || this.defaultModel,
        system,
        max_tokens: maxTokens || this.generation.maxTokens,
        temperature: temperature ?? this.generation.temperature,
        messages: toAnthropicMessages(messages),
        tools: toolDefs,
      });
      const text = response.content?.filter((c) => c.type === 'text').map((c) => c.text).join('') || null;
      const toolCalls = response.content
        ?.filter((c) => c.type === 'tool_use')
        .map((c) => new ToolCallRequest({ id: c.id, name: c.name, arguments: c.input })) || [];
      return new LLMResponse({
        content: text,
        toolCalls,
        finishReason: toolCalls.length ? 'tool_calls' : 'stop',
        usage: {
          prompt_tokens: response.usage?.input_tokens || 0,
          completion_tokens: response.usage?.output_tokens || 0,
        },
      });
    } catch (e) {
      return new LLMResponse({ content: `Error calling LLM: ${e.message}`, finishReason: 'error' });
    }
  }
}
