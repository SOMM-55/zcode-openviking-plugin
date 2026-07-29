// scripts/ov-status.mjs
// One-line status: connection, last recall / capture counters, pending.
import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { probeOvServer } from './lib/ov-client.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

async function readState(name) {
  try { return JSON.parse(await readFile(join(homedir(), '.zcode', 'openviking', 'state', name), 'utf8')); }
  catch { return null; }
}

export async function main() {
  const entry = await discoverOpenVikingMcp();
  const url = entry?.url || process.env.OPENVIKING_URL || 'http://127.0.0.1:1933';
  const probe = await probeOvServer(url);
  if (!probe.ok) { process.stdout.write(`OV ✗ offline (${url})\n`); return; }
  const recall = await readState('last-recall.json');
  const capture = await readState('last-capture.json');
  const rParts = [];
  if (recall) rParts.push(`↩ ${recall.count ?? 0} mem (${(recall.topScore ?? 0).toFixed(2)})`);
  if (capture) rParts.push(`✎ ${capture.pending ?? 0}/${capture.threshold ?? 20000}`);
  process.stdout.write(`OV ✓ ${url}${rParts.length ? ' │ ' + rParts.join(' · ') : ''}\n`);
}

// Only auto-run when invoked directly (not when imported by ov.mjs)
const isDirect = import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`;
if (isDirect) {
  main().catch(err => { console.error('ov-status:', err.message); process.exit(1); });
}