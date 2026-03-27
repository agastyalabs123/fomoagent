/**
 * Configuration schema — plain JS objects with defaults.
 * Mirrors nanobot's config/schema.py.
 */

export const PROVIDER_SPECS = [
  { name: 'openrouter', keywords: ['openrouter'], envKey: 'OPENROUTER_API_KEY', defaultApiBase: 'https://openrouter.ai/api/v1', isGateway: true },
  { name: 'anthropic', keywords: ['anthropic', 'claude'], envKey: 'ANTHROPIC_API_KEY', defaultApiBase: null },
  { name: 'openai', keywords: ['openai', 'gpt'], envKey: 'OPENAI_API_KEY', defaultApiBase: null },
  { name: 'azure', keywords: ['azure', 'gpt-4', 'o1', 'o3'], envKey: 'AZURE_OPENAI_API_KEY', defaultApiBase: null },
  { name: 'deepseek', keywords: ['deepseek'], envKey: 'DEEPSEEK_API_KEY', defaultApiBase: 'https://api.deepseek.com' },
  { name: 'gemini', keywords: ['gemini'], envKey: 'GEMINI_API_KEY', defaultApiBase: 'https://generativelanguage.googleapis.com/v1beta/openai/' },
  { name: 'groq', keywords: ['groq'], envKey: 'GROQ_API_KEY', defaultApiBase: 'https://api.groq.com/openai/v1' },
  { name: 'ollama', keywords: ['ollama'], envKey: 'OLLAMA_API_KEY', defaultApiBase: 'http://localhost:11434/v1', isLocal: true },
  { name: 'custom', keywords: [], envKey: '', defaultApiBase: null, isDirect: true },
];

export function defaultConfig() {
  return {
    agents: {
      defaults: {
        workspace: '~/.fomoagent/workspace',
        model: 'anthropic/claude-sonnet-4-20250514',
        provider: 'auto',
        maxTokens: 8192,
        contextWindowTokens: 65_536,
        temperature: 0.1,
        maxToolIterations: 40,
        reasoningEffort: null,
        timezone: 'UTC',
        runTimeoutSeconds: 180,
      },
    },
    providers: {
      anthropic: { apiKey: '', apiBase: null },
      openai: { apiKey: '', apiBase: null },
      azure: { apiKey: '', apiBase: null, apiVersion: '2024-06-01', deployment: '' },
      openrouter: { apiKey: '', apiBase: null },
      deepseek: { apiKey: '', apiBase: null },
      gemini: { apiKey: '', apiBase: null },
      groq: { apiKey: '', apiBase: null },
      ollama: { apiKey: '', apiBase: null },
      custom: { apiKey: '', apiBase: null },
    },
    gateway: { host: '0.0.0.0', port: 18790 },
    runtime: {
      maxConcurrentRuns: 8,
    },
    scheduler: {
      enabled: true,
      tickSeconds: 15,
      maxRunHistory: 100,
    },
    heartbeat: {
      enabled: false,
      intervalMinutes: 30,
      maxRunsPerHour: 4,
      prompt:
        'Read HEARTBEAT.md and decide what proactive checks should run now. If no checks are due, reply with "skip".',
    },
    mcp: {
      enabled: false,
      timeoutSeconds: 30,
      servers: [],
    },
    tools: {
      web: { proxy: null, search: { provider: 'duckduckgo', apiKey: '', maxResults: 5 } },
      exec: { enable: true, timeout: 60, pathAppend: '' },
      restrictToWorkspace: false,
    },
    retries: {
      delaysMs: [1000, 2000, 4000],
    },
  };
}
