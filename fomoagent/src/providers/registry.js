/**
 * Provider registry — creates the right provider from config.
 * Mirrors nanobot's providers/registry.py + config._match_provider.
 */

import { matchProvider } from '../config/loader.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';
import { AnthropicProvider } from './anthropic.js';
import { AzureOpenAIProvider } from './azure-openai.js';

export function createProvider(config) {
  const model = config.agents?.defaults?.model;
  const match = matchProvider(config, model);

  if (!match) {
    throw new Error(
      'No LLM provider configured. Set an API key in config.json or environment variables.\n' +
      'Example: ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, etc.'
    );
  }

  const { providerConfig, spec } = match;
  const apiBase = providerConfig.apiBase || spec.defaultApiBase || undefined;

  // Strip "provider/" prefix from model name to get bare model
  let defaultModel = model || 'gpt-4o';
  if (defaultModel.includes('/')) {
    // Keep the full model for the provider to decide
  }

  let provider;
  if (spec.name === 'anthropic') {
    provider = new AnthropicProvider({
      apiKey: providerConfig.apiKey,
      defaultModel,
    });
  } else if (spec.name === 'azure') {
    provider = new AzureOpenAIProvider({
      apiKey: providerConfig.apiKey,
      apiBase: providerConfig.apiBase,
      deployment: providerConfig.deployment || defaultModel.split('/').pop(),
      apiVersion: providerConfig.apiVersion,
      defaultModel,
    });
  } else {
    provider = new OpenAICompatibleProvider({
      apiKey: providerConfig.apiKey,
      apiBase: apiBase,
      defaultModel,
      spec,
    });
  }

  // Apply generation defaults from config
  const agentDefaults = config.agents?.defaults || {};
  provider.generation = {
    temperature: agentDefaults.temperature ?? 0.1,
    maxTokens: agentDefaults.maxTokens ?? 8192,
    reasoningEffort: agentDefaults.reasoningEffort || null,
  };
  provider.retryDelaysMs = config.retries?.delaysMs || [1000, 2000, 4000];

  return provider;
}
