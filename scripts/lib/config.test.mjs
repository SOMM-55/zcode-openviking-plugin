// scripts/lib/config.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from './config.mjs';

const savedEnv = { ...process.env };

function reset(env = {}) {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('OPENVIKING_')) delete process.env[k];
  }
  Object.assign(process.env, env);
}

test.afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('OPENVIKING_')) delete process.env[k];
  }
  Object.assign(process.env, savedEnv);
});

test('defaults when nothing set', () => {
  reset();
  const c = resolveConfig({});
  assert.equal(c.url, 'http://127.0.0.1:1933');
  assert.equal(c.apiKey, '');
  assert.equal(c.account, '');
  assert.equal(c.user, '');
  assert.equal(c.recallLimit, 6);
  assert.equal(c.captureMode, 'semantic');
});

test('env vars beat defaults', () => {
  reset({ OPENVIKING_URL: 'https://remote.example', OPENVIKING_API_KEY: 'k1', OPENVIKING_ACCOUNT: 'team', OPENVIKING_USER: 'alice' });
  const c = resolveConfig({});
  assert.equal(c.url, 'https://remote.example');
  assert.equal(c.apiKey, 'k1');
  assert.equal(c.account, 'team');
  assert.equal(c.user, 'alice');
});

test('file values beat defaults but env still wins', () => {
  reset({ OPENVIKING_URL: 'https://env-wins' });
  const c = resolveConfig({ fileConfig: { url: 'https://from-file', apiKey: 'fk', recallLimit: 12 } });
  assert.equal(c.url, 'https://env-wins');
  assert.equal(c.apiKey, 'fk');
  assert.equal(c.recallLimit, 12);
});

test('mcpDiscovered beats file', () => {
  reset();
  const c = resolveConfig({
    fileConfig: { url: 'https://file' },
    mcpDiscovered: { url: 'https://from-mcp', headers: { Authorization: 'Bearer xyz' } },
  });
  assert.equal(c.url, 'https://from-mcp');
  assert.equal(c.headers.Authorization, 'Bearer xyz');
});