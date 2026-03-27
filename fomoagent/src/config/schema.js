/**
 * Configuration schema — plain JS objects with defaults.
 * Mirrors nanobot's config/schema.py.
 */

export const PROVIDER_SPECS = [
  { name: 'gemini', keywords: ['gemini'], envKey: 'GEMINI_API_KEY', defaultApiBase: 'https://generativelanguage.googleapis.com/v1beta/openai/' },
];

export function defaultConfig() {
  return {
    agents: {
      defaults: {
        workspace: '~/.fomoagent/workspace',
        model: 'gemini/gemini-2.0-flash',
        provider: 'gemini',
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
      gemini: { apiKey: '', apiBase: null },
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
