// scripts/auto-capture.mjs
// ZCode Stop hook. Parses transcript → strips pollution → filters turns
// → batch-sends to OV `remember` (async-detached so user never waits).

import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { turnsToMessages, shouldCapture } from './lib/capture.mjs';
import { detachAndRun, approve } from './lib/async-writer.mjs';
import { debug } from './lib/debug-log.mjs';

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
  if (process.env.OPENVIKING_MEMORY_ENABLED === '0') { approve(); return; }
  if (cfg.captureMode === 'off') { approve(); return; }

  const turns = Array.isArray(hookInput.transcript) ? hookInput.transcript
              : Array.isArray(hookInput.turns) ? hookInput.turns
              : Array.isArray(hookInput.messages) ? hookInput.messages
              : [];
  const messages = turnsToMessages(turns.filter(t => shouldCapture(t, { minQueryLength: cfg.recallMinQueryLength, captureMode: cfg.captureMode })));
  if (messages.length === 0) { approve(); return; }

  if (cfg.writePathAsync) {
    await detachAndRun({ scriptPath: 'auto-capture.mjs', payload: { messages, detached: true }, env: { OPENVIKING_DETACHED: '1', OPENVIKING_URL: cfg.url, OPENVIKING_API_KEY: cfg.apiKey || '', OPENVIKING_ACCOUNT: cfg.account || '', OPENVIKING_USER: cfg.user || '' } });
    approve();
    return;
  }

  // Synchronous path (used when writePathAsync=false, e.g. for debugging)
  const { OvClient } = await import('./lib/ov-client.mjs');
  const client = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: cfg.captureTimeoutMs });
  await client.initialize();
  await client.remember(messages);
  approve();
}

// When invoked in detached mode, run a single remember then exit.
if (process.env.OPENVIKING_DETACHED === '1') {
  (async () => {
    try {
      const raw = await readStdin();
      const { messages } = JSON.parse(raw);
      const cfg = resolveConfig();
      const { OvClient } = await import('./lib/ov-client.mjs');
      const client = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: cfg.captureTimeoutMs });
      await client.initialize();
      const r = await client.remember(messages);
      await debug('capture:detached-ok', { count: messages.length, result: r?.structuredContent?.result || r?.content?.[0]?.text });
    } catch (err) {
      await debug('capture:detached-err', { message: err.message });
    }
    process.exit(0);
  })();
} else {
  main().catch(err => { console.error('OV capture failed:', err.message); approve(); });
}