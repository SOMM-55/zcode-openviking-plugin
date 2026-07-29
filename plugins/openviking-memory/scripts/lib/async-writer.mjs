// scripts/lib/async-writer.mjs
// Detached worker helper for Stop / SessionEnd hooks. The parent hook
// drains stdin, prints `{}` (or decision:approve) immediately, then spawns
// a background clone to do the actual HTTP work — the user never waits.

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function detachAndRun({ scriptPath, payload, env = {} }) {
  const here = dirname(fileURLToPath(import.meta.url));
  const childScript = resolve(here, '..', scriptPath);
  const child = spawn(process.execPath, [childScript], {
    detached: true,
    stdio: ['pipe', 'ignore', 'ignore'],
    env: { ...process.env, ...env, OPENVIKING_DETACHED: '1' },
  });
  child.unref();
  try {
    child.stdin.write(JSON.stringify(payload || {}));
    child.stdin.end();
  } catch { /* */ }
}

export function approve() {
  // Emit the standard "approve immediately" JSON for ZCode hook outputs.
  process.stdout.write(JSON.stringify({ continue: true, decision: 'approve' }) + '\n');
}