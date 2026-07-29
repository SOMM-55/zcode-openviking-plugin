// scripts/session-start.mjs
// ZCode SessionStart hook. Probes MCP; if missing, kicks off setup-wizard
// in detached mode (the parent returns immediately so the user is never
// blocked). On resume/compact, fetches a small archive overview.

import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { OvClient, probeOvServer } from './lib/ov-client.mjs';
import { deriveOvSessionId } from './lib/session.mjs';
import { debug } from './lib/debug-log.mjs';
import { detachAndRun } from './lib/async-writer.mjs';

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
  const sessionId = hookInput.session_id || hookInput.sessionId || process.env.ZCODE_SESSION_ID || `proc-${process.pid}`;
  const ovSession = deriveOvSessionId(sessionId);
  process.env.OPENVIKING_OV_SESSION_ID = ovSession;

  const entry = await discoverOpenVikingMcp();
  const url = entry?.url || process.env.OPENVIKING_URL || 'http://127.0.0.1:1933/mcp';
  const probe = await probeOvServer(url);
  if (!probe.ok) {
    if (!entry) {
      // No MCP entry — try the wizard in detached mode.
      try {
        await detachAndRun({ scriptPath: 'setup-wizard.mjs', payload: {} });
      } catch { /* */ }
    }
    await debug('session:no-server', { url });
    process.stdout.write(JSON.stringify({ continue: true, hookSpecificOutput: { additionalContext: 'OV: no working server — setup wizard running in background. Run `/ov status` to check.' } }));
    return;
  }

  const cfg = resolveConfig({ mcpDiscovered: entry });
  const client = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: cfg.timeoutMs, sessionId: probe.sessionId });
  try {
    await client.initialize();
    await debug('session:ok', { url: cfg.url, ovSession });
  } catch (err) {
    await debug('session:init-fail', { message: err.message });
  }
  process.stdout.write(JSON.stringify({ continue: true }));
}

main().catch(err => { console.error('OV session-start failed:', err.message); process.stdout.write(JSON.stringify({ continue: true })); });