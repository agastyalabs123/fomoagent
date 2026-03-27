/**
 * Agent runner — the core LLM tool-use loop.
 * Mirrors nanobot's agent/runner.py.
 */

import { buildAssistantMessage, stripThink } from '../utils/helpers.js';

export class AgentRunner {
  constructor(provider) {
    this.provider = provider;
  }

  /**
   * Run the tool-use loop.
   * @param {object} spec
   * @param {Array} spec.messages - Initial messages
   * @param {object} spec.tools - ToolRegistry
   * @param {string} spec.model
   * @param {number} spec.maxIterations
   * @param {object} [spec.hooks] - { onStream, onStreamEnd, onToolHint, onProgress }
   * @param {boolean} [spec.streaming] - Use streaming API
   */
  async run(spec) {
    const {
      messages: initialMessages,
      tools,
      model,
      maxIterations = 40,
      hooks = {},
      streaming = false,
      shouldCancel = null,
    } = spec;
    const messages = [...initialMessages];
    let finalContent = null;
    const toolsUsed = [];
    let usage = { prompt_tokens: 0, completion_tokens: 0 };
    let error = null;
    let stopReason = 'completed';
    const toolEvents = [];

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (shouldCancel && shouldCancel()) {
        stopReason = 'cancelled';
        finalContent = 'Run cancelled before completion.';
        break;
      }
      let response;

      if (streaming && hooks.onStream) {
        response = await this.provider.chatStreamWithRetry({
          messages,
          tools: tools.getDefinitions(),
          model,
          onContentDelta: async (delta) => {
            const clean = stripThink(delta);
            if (clean) await hooks.onStream(clean);
          },
        });
      } else {
        response = await this.provider.chatWithRetry({
          messages,
          tools: tools.getDefinitions(),
          model,
        });
      }

      usage = response.usage || usage;

      if (response.hasToolCalls) {
        if (streaming && hooks.onStreamEnd) {
          await hooks.onStreamEnd(true);
        }

        // Notify about tool calls
        if (hooks.onToolHint) {
          const hint = response.toolCalls.map(tc => {
            const arg = Object.values(tc.arguments)[0];
            const argStr = typeof arg === 'string' ? (arg.length > 40 ? `"${arg.slice(0, 40)}…"` : `"${arg}"`) : '';
            return argStr ? `${tc.name}(${argStr})` : tc.name;
          }).join(', ');
          await hooks.onToolHint(hint);
        }

        messages.push(buildAssistantMessage(response.content || '', {
          toolCalls: response.toolCalls.map(tc => tc.toOpenAIToolCall()),
          reasoningContent: response.reasoningContent,
        }));

        for (const tc of response.toolCalls) {
          toolsUsed.push(tc.name);
        }

        // Execute tools (concurrent)
        const results = await Promise.all(
          response.toolCalls.map(async (tc) => {
            if (shouldCancel && shouldCancel()) {
              return { toolCallId: tc.id, name: tc.name, result: 'Error: Run cancelled.' };
            }
            try {
              const result = await tools.execute(tc.name, tc.arguments);
              const detail = String(result || '').replace(/\n/g, ' ').trim().slice(0, 120) || '(empty)';
              toolEvents.push({ name: tc.name, status: typeof result === 'string' && result.startsWith('Error') ? 'error' : 'ok', detail });
              return { toolCallId: tc.id, name: tc.name, result };
            } catch (e) {
              toolEvents.push({ name: tc.name, status: 'error', detail: e.message });
              return { toolCallId: tc.id, name: tc.name, result: `Error: ${e.message}` };
            }
          })
        );

        for (const { toolCallId, name, result } of results) {
          const content = typeof result === 'string' ? result : JSON.stringify(result);
          // Truncate large tool results
          const truncated = content.length > 16_000 ? content.slice(0, 16_000) + '\n... (truncated)' : content;
          messages.push({ role: 'tool', tool_call_id: toolCallId, name, content: truncated });
        }

        continue;
      }

      // No tool calls — this is the final response
      if (streaming && hooks.onStreamEnd) {
        await hooks.onStreamEnd(false);
      }

      const clean = stripThink(response.content);

      if (response.finishReason === 'error') {
        finalContent = clean || 'Sorry, I encountered an error calling the AI model.';
        stopReason = 'error';
        error = finalContent;
        break;
      }

      messages.push(buildAssistantMessage(clean, { reasoningContent: response.reasoningContent }));
      finalContent = clean;
      break;
    }

    if (finalContent === null && stopReason === 'completed') {
      stopReason = 'max_iterations';
      finalContent = `I reached the maximum number of tool call iterations (${maxIterations}) without completing the task.`;
    }

    return { finalContent, messages, toolsUsed, usage, stopReason, error, toolEvents };
  }
}
