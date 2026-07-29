// scripts/lib/ov-client.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OvClient } from './ov-client.mjs';

// Fake fetch that records calls and returns canned responses.
function fakeFetch(responses) {
  const calls = [];
  const queue = [...responses];
  return {
    calls,
    fn: async (url, init) => {
      calls.push({ url, init });
      const next = queue.shift();
      if (!next) throw new Error('no more canned responses');
      return new Response(next.body, { status: next.status ?? 200, headers: next.headers ?? { 'content-type': 'application/json' } });
    },
  };
}

test('initialize sends the right JSON-RPC payload', async () => {
  const f = fakeFetch([{ body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'ov' }, protocolVersion: '2024-11-05' } }), headers: { 'mcp-session-id': 'sess-1' } }]);
  const c = new OvClient({ url: 'http://x/mcp', fetch: f.fn });
  const res = await c.initialize();
  assert.equal(f.calls[0].url, 'http://x/mcp');
  assert.equal(f.calls[0].init.method, 'POST');
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.method, 'initialize');
  assert.equal(c.sessionId, 'sess-1');
});

test('toolsCall wraps the MCP tool call envelope', async () => {
  const f = fakeFetch([{ body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'ok' }], isError: false } }) }]);
  const c = new OvClient({ url: 'http://x/mcp', fetch: f.fn, sessionId: 'sess-1' });
  const res = await c.toolsCall('remember', { messages: [{ role: 'user', content: 'hi' }] });
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.method, 'tools/call');
  assert.equal(body.params.name, 'remember');
  assert.equal(f.calls[0].init.headers['mcp-session-id'], 'sess-1');
  assert.equal(res.isError, false);
});