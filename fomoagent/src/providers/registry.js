/**
 * Provider registry — creates the right provider from config.
 * Mirrors nanobot's providers/registry.py + config._match_provider.
 *
 * Fallback chain: Gemini → OpenRouterFree (when Gemini returns a transient error).
 */

import { matchProvider } from '../config/loader.js';
import { GeminiProvider } from './gemini.js';
import { OpenRouterFreeProvider } from './openrouter_free.js';
import { LLMProvider } from './base.js';

const TRANSIENT_MARKERS = ['429', 'rate limit', 'resource_exhausted', 'resource exhausted', '500', '502', '503', '504', 'overloaded', 'timeout', 'timed out'];

function isTransientError(content) {
  const lower = (content || '').toLowerCase();
  return TRANSIENT_MARKERS.some(m => lower.includes(m));
}

/**
 * Wraps a primary provider with an OpenRouter free fallback.
 * If the primary returns finishReason === 'error' AND the message looks transient,
 * the call is transparently retried on OpenRouter.
 */
class FallbackProvider extends LLMProvider {
  constructor(primary, fallback) {
    super({});
    this._primary = primary;
    this._fallback = fallback;
    // expose generation/retryDelaysMs from primary so callers can read them
    this.generation = primary.generation;
    this.retryDelaysMs = primary.retryDelaysMs;
  }

  getDefaultModel() { return this._primary.getDefaultModel(); }

  async _tryFallback(method, kw) {
    console.warn(`[provider] Gemini transient error — switching to OpenRouter free (${this._fallback.getDefaultModel()})`);
    return this._fallback[method](kw);
  }

  // On first transient error from Gemini, immediately fall back — don't wait through all Gemini retries.
  async chat(kw) {
    const resp = await this._primary.chat(kw);
    if (resp.finishReason === 'error' && isTransientError(resp.content)) {
      return this._tryFallback('chat', kw);
    }
    return resp;
  }

  async chatStream(kw) {
    const resp = await this._primary.chatStream(kw);
    if (resp.finishReason === 'error' && isTransientError(resp.content)) {
      return this._tryFallback('chatStream', kw);
    }
    return resp;
  }

  // Override chatWithRetry to bypass the primary's retry loop on transient errors.
  // Instead of waiting 8s+20s+60s on Gemini 429, fall back to OpenRouter immediately.
  async chatWithRetry(kw) {
    const resp = await this._primary.chat(kw);
    if (resp.finishReason !== 'error') return resp;
    if (isTransientError(resp.content)) {
      return this._tryFallback('chatWithRetry', kw);
    }
    return resp;
  }

  async chatStreamWithRetry(kw) {
    const resp = await this._primary.chatStream(kw);
    if (resp.finishReason !== 'error') return resp;
    if (isTransientError(resp.content)) {
      return this._tryFallback('chatStreamWithRetry', kw);
    }
    return resp;
  }
}

export function createProvider(config) {
  const model = config.agents?.defaults?.model;
  const match = matchProvider(config, model);

  if (!match) {
    throw new Error(
      'No Gemini provider configured. Set GEMINI_API_KEY in config.json or environment variables.'
    );
  }

  const { providerConfig, spec } = match;
  const apiBase = providerConfig.apiBase || spec.defaultApiBase;
  const defaultModel = model || 'gemini/gemini-2.5-flash-lite';
  const primary = new GeminiProvider({
    apiKey: providerConfig.apiKey,
    apiBase,
    defaultModel,
    spec,
  });

  // Apply generation defaults from config
  const agentDefaults = config.agents?.defaults || {};
  primary.generation = {
    temperature: agentDefaults.temperature ?? 0.1,
    maxTokens: agentDefaults.maxTokens ?? 8192,
    reasoningEffort: agentDefaults.reasoningEffort || null,
  };
  primary.retryDelaysMs = config.retries?.delaysMs || [8000, 20000, 60000];

  // Build OpenRouter free fallback if configured or OPENROUTER_API_KEY is present
  const orConfig = config.providers?.openrouterFree || {};
  const orApiKey = orConfig.apiKey || process.env.OPENROUTER_API_KEY || '';
  if (orApiKey) {
    const fallback = new OpenRouterFreeProvider({
      apiKey: orApiKey,
      model: orConfig.model || undefined,
    });
    fallback.generation = primary.generation;
    fallback.retryDelaysMs = [2000, 5000];
    return new FallbackProvider(primary, fallback);
  }

  return primary;
}
