/**
 * Provider registry — creates the right provider from config.
 * Mirrors nanobot's providers/registry.py + config._match_provider.
 */

import { matchProvider } from '../config/loader.js';
import { GeminiProvider } from './gemini.js';

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
  const provider = new GeminiProvider({
    apiKey: providerConfig.apiKey,
    apiBase,
    defaultModel,
    spec,
  });

  // Apply generation defaults from config
  const agentDefaults = config.agents?.defaults || {};
  provider.generation = {
    temperature: agentDefaults.temperature ?? 0.1,
    maxTokens: agentDefaults.maxTokens ?? 8192,
    reasoningEffort: agentDefaults.reasoningEffort || null,
  };
  provider.retryDelaysMs = config.retries?.delaysMs || [8000, 20000, 60000];

  return provider;
}
