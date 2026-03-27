/**
 * Configuration loading — reads JSON, resolves env vars, merges defaults.
 * Mirrors nanobot's config/loader.py.
 */

import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { defaultConfig, PROVIDER_SPECS } from './schema.js';

let _currentConfigPath = null;

export function setConfigPath(p) { _currentConfigPath = p; }

export function getConfigPath() {
  return _currentConfigPath || path.join(homedir(), '.fomoagent', 'config.json');
}

export function getDataDir() {
  return path.dirname(getConfigPath());
}

export function getWorkspacePath(workspace) {
  const ws = workspace || path.join(homedir(), '.fomoagent', 'workspace');
  const resolved = ws.startsWith('~') ? ws.replace('~', homedir()) : ws;
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const [key, val] of Object.entries(source)) {
    if (val && typeof val === 'object' && !Array.isArray(val) && typeof out[key] === 'object' && out[key]) {
      out[key] = deepMerge(out[key], val);
    } else if (out[key] === undefined || out[key] === null || out[key] === '') {
      out[key] = val;
    }
  }
  return out;
}

/** Resolve ${VAR} placeholders from process.env. */
function resolveEnvVars(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] || '');
  }
  if (Array.isArray(obj)) return obj.map(resolveEnvVars);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = resolveEnvVars(v);
    return out;
  }
  return obj;
}

export function loadConfig(configPath) {
  const p = configPath || getConfigPath();
  _currentConfigPath = p;
  const defaults = defaultConfig();

  if (fs.existsSync(p)) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const resolved = resolveEnvVars(raw);
      const merged = deepMerge(resolved, defaults);
      hydrateProviderKeysFromEnv(merged);
      return merged;
    } catch (e) {
      console.warn(`Failed to load config from ${p}: ${e.message}. Using defaults.`);
    }
  }

  hydrateProviderKeysFromEnv(defaults);
  return defaults;
}

function hydrateProviderKeysFromEnv(config) {
  for (const spec of PROVIDER_SPECS) {
    if (!spec.envKey) continue;
    const envValue = process.env[spec.envKey];
    if (!envValue) continue;
    if (!config.providers?.[spec.name]) continue;
    if (!config.providers[spec.name].apiKey) {
      config.providers[spec.name].apiKey = envValue;
    }
  }
}

export function validateConfig(config) {
  const issues = [];
  const model = config?.agents?.defaults?.model;
  const workspace = config?.agents?.defaults?.workspace;
  const timeout = config?.tools?.exec?.timeout;
  const runTimeout = config?.agents?.defaults?.runTimeoutSeconds;
  const maxIter = config?.agents?.defaults?.maxToolIterations;

  if (!model || typeof model !== 'string') {
    issues.push('agents.defaults.model must be a non-empty string');
  }
  if (!workspace || typeof workspace !== 'string') {
    issues.push('agents.defaults.workspace must be a non-empty string');
  }
  if (typeof timeout !== 'number' || timeout < 1 || timeout > 600) {
    issues.push('tools.exec.timeout must be between 1 and 600 seconds');
  }
  if (typeof runTimeout !== 'number' || runTimeout < 10 || runTimeout > 3600) {
    issues.push('agents.defaults.runTimeoutSeconds must be between 10 and 3600');
  }
  if (typeof maxIter !== 'number' || maxIter < 1 || maxIter > 200) {
    issues.push('agents.defaults.maxToolIterations must be between 1 and 200');
  }

  if (issues.length) {
    throw new Error(`Invalid config:\n- ${issues.join('\n- ')}`);
  }
}

/**
 * Match a provider spec from model name + config.
 * Returns { providerConfig, specName } or null.
 */
export function matchProvider(config, model) {
  const forced = config.agents?.defaults?.provider || 'auto';
  const modelStr = (model || config.agents?.defaults?.model || '').toLowerCase();
  const prefix = modelStr.includes('/') ? modelStr.split('/')[0] : '';

  if (forced !== 'auto') {
    const spec = PROVIDER_SPECS.find(s => s.name === forced);
    if (spec) {
      const pc = config.providers?.[spec.name];
      if (pc && (spec.isLocal || spec.isDirect || pc.apiKey)) return { providerConfig: pc, spec };
    }
    return null;
  }

  // Prefix match
  for (const spec of PROVIDER_SPECS) {
    if (prefix && prefix === spec.name) {
      const pc = config.providers?.[spec.name];
      if (pc && (spec.isLocal || spec.isDirect || pc.apiKey)) return { providerConfig: pc, spec };
    }
  }

  // Keyword match
  for (const spec of PROVIDER_SPECS) {
    const pc = config.providers?.[spec.name];
    if (pc && spec.keywords.some(kw => modelStr.includes(kw))) {
      if (spec.isLocal || spec.isDirect || pc.apiKey) return { providerConfig: pc, spec };
    }
  }

  // Fallback: first provider with an API key
  for (const spec of PROVIDER_SPECS) {
    const pc = config.providers?.[spec.name];
    if (pc?.apiKey) return { providerConfig: pc, spec };
  }

  return null;
}

export function saveConfig(config, configPath) {
  const p = configPath || getConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf-8');
}
