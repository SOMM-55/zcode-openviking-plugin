// scripts/pre-compact.mjs
// ZCode PreCompact hook — synchronous commit of any pending capture
// before the harness mutates the transcript. For v1 we just trigger the
// capture flow synchronously by re-using auto-capture.mjs without async.

import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { turnsToMessages, shouldCapture } from './lib/capture.mjs';
import { OvClient } from './lib/ov-client.mjs';
import { debug } from './lib/debug-log.mjs';
import { approve } from './lib/async-writer.mjs';

async function readStdin() {
  return new Promise(resolve => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => buf += d);
    process.stdin.on('end', () => resolve(buf));
    process.stdin.resume();
  });
}

async function main() {
  const raw = await readStdin();
  let hookInput = {};
  try { hookInput = JSON.parse(raw); } catch {}
  const cfg = resolveConfig({ mcpDiscovered: await discoverOpenVikingMcp() });
  const turns = Array.isArray(hookInput.transcript) ? hookInput.transcript : [];
  const messages = turnsToMessages(turns.filter(t => shouldCapture(t, { minQueryLength: cfg.recallMinQueryLength, captureMode: 'semantic' })));
  if (messages.length === 0) { approve(); return; }
  try {
    const client = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: cfg.captureTimeoutMs });
    await client.initialize();
    await client.remember(messages);
    await debug('precompact:ok', { count: messages.length });
  } catch (err) {
    await debug('precompact:err', { message: err.message });
  }
  approve();
}

main().catch(err => { console.error('OV precompact failed:', err.message); approve(); });