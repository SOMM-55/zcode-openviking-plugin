// scripts/session-end.mjs
// ZCode SessionEnd hook — final async commit. Re-uses auto-capture.mjs in
// detached mode with whatever transcript we can scrape from the hook input.

import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { turnsToMessages, shouldCapture } from './lib/capture.mjs';
import { detachAndRun, approve } from './lib/async-writer.mjs';

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
  if (messages.length > 0) {
    await detachAndRun({
      scriptPath: 'auto-capture.mjs',
      payload: { messages, detached: true },
      env: {
        OPENVIKING_DETACHED: '1',
        OPENVIKING_URL: cfg.url,
        OPENVIKING_API_KEY: cfg.apiKey || '',
        OPENVIKING_ACCOUNT: cfg.account || '',
        OPENVIKING_USER: cfg.user || '',
      },
    });
  }
  approve();
}

main().catch(err => { console.error('OV session-end failed:', err.message); approve(); });