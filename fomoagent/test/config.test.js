import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig } from '../src/config/schema.js';
import { validateConfig } from '../src/config/loader.js';

test('default config validates', () => {
  const cfg = defaultConfig();
  assert.doesNotThrow(() => validateConfig(cfg));
});

test('invalid config fails validation', () => {
  const cfg = defaultConfig();
  cfg.tools.exec.timeout = 1000;
  assert.throws(() => validateConfig(cfg), /Invalid config/);
});
