// scripts/setup-wizard.mjs
// Discovers or creates the openviking MCP server entry. Non-interactive
// mode (env vars set or already configured) just probes and exits.
// Interactive mode (TTY) prompts for URL / key / account / user.

import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { OvClient, probeOvServer } from './lib/ov-client.mjs';
import { debug } from './lib/debug-log.mjs';

async function ensureLocal() {
  const r = await probeOvServer('http://127.0.0.1:1933/mcp');
  return r.ok ? { url: 'http://127.0.0.1:1933', headers: {} } : null;
}

async function tryDiscover() {
  const entry = await discoverOpenVikingMcp();
  if (!entry?.url) return null;
  const r = await probeOvServer(entry.url);
  return r.ok ? entry : null;
}

function prompt(question) {
  // Minimal TTY prompt; falls back to stdin readline when available.
  process.stdout.write(`${question}: `);
  return new Promise(resolve => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', d => { buf = d.toString().trim(); resolve(buf); });
    process.stdin.resume();
  });
}

async function interactiveConfigure() {
  const url = await prompt('OpenViking URL (default http://127.0.0.1:1933)');
  const apiKey = await prompt('API key (blank for none)');
  const account = await prompt('Account (blank for none)');
  const user = await prompt('User (blank for none)');
  return { url: url || 'http://127.0.0.1:1933', apiKey, account, user };
}

export async function main() {
  await debug('setup:start');
  let chosen = await ensureLocal() || await tryDiscover();
  if (!chosen && process.env.OPENVIKING_NONINTERACTIVE !== '1') {
    if (process.stdin.isTTY) {
      chosen = await interactiveConfigure();
    } else {
      console.error('OV: not configured and non-interactive. Set OPENVIKING_URL / OPENVIKING_API_KEY.');
      process.exit(2);
    }
  }
  if (!chosen) { process.exit(2); }
  const cfg = resolveConfig({ mcpDiscovered: chosen });
  const client = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: 8000 });
  await client.initialize();
  await debug('setup:ok', { url: cfg.url });
  console.log(`OV: configured → ${cfg.url}`);
}

// Only auto-run when invoked directly (not when imported by ov.mjs)
const isDirect = import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`;
if (isDirect) {
  main().catch(err => { console.error('OV setup failed:', err.message); process.exit(1); });
}