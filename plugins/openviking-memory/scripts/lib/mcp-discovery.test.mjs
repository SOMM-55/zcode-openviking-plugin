// scripts/lib/mcp-discovery.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOpenVikingMcpEntry } from './mcp-discovery.mjs';

test('matches openviking, openviking-memory, openviking-mcp names', () => {
  const cfg = { mcp: { servers: {
    openviking: { type: 'http', url: 'http://a' },
    openviking_memory: { type: 'http', url: 'http://b' },
    'openviking-mcp': { type: 'http', url: 'http://c' },
    playwright: { type: 'stdio', command: 'x' },
  } } };
  const r = findOpenVikingMcpEntry(cfg);
  assert.equal(r.url, 'http://a');
  assert.equal(r.name, 'openviking');
});

test('returns null when no match', () => {
  const cfg = { mcp: { servers: { playwright: { type: 'stdio', command: 'x' } } } };
  assert.equal(findOpenVikingMcpEntry(cfg), null);
});

test('also reads top-level mcpServers fallback', () => {
  const cfg = { mcpServers: { openviking: { type: 'http', url: 'http://x' } } };
  const r = findOpenVikingMcpEntry(cfg);
  assert.equal(r.url, 'http://x');
});

test('passes through headers', () => {
  const cfg = { mcp: { servers: { openviking: { type: 'http', url: 'http://x', headers: { Authorization: 'Bearer t' } } } } };
  const r = findOpenVikingMcpEntry(cfg);
  assert.equal(r.headers.Authorization, 'Bearer t');
});