// scripts/ov.mjs
// Dispatcher for `/${command} <subcommand> [args]`. Args after the
// subcommand are joined into a single string and forwarded to the
// matching MCP tool with sensible defaults.

import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { OvClient, probeOvServer } from './lib/ov-client.mjs';

async function client() {
  const cfg = resolveConfig({ mcpDiscovered: await discoverOpenVikingMcp() });
  const probe = await probeOvServer(cfg.url);
  if (!probe.ok) throw new Error(`OV server unreachable at ${cfg.url}`);
  const c = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: cfg.timeoutMs, sessionId: probe.sessionId });
  await c.initialize();
  return c;
}

function printResult(r) {
  const text = r?.structuredContent?.result || r?.content?.[0]?.text || JSON.stringify(r, null, 2);
  process.stdout.write(text + '\n');
}

async function main() {
  const [, , sub, ...rest] = process.argv;
  const arg = rest.join(' ').trim();
  if (!sub || sub === 'help') {
    process.stdout.write(help());
    return;
  }
  const c = await client();
  switch (sub) {
    case 'remember':   return printResult(await c.remember([{ role: 'user', content: arg }]));
    case 'recall':     return printResult(await c.recall({ query: arg }));
    case 'find':       return printResult(await c.find({ query: arg, limit: 10 }));
    case 'search':     return printResult(await c.search({ query: arg, limit: 10 }));
    case 'read':       return printResult(await c.read([arg]));
    case 'list':       return printResult(await c.list(arg || 'viking://', true));
    case 'glob':       return printResult(await c.glob(arg));
    case 'grep': {
      const [uri, ...pat] = rest;
      return printResult(await c.grep(uri, pat.length ? pat : [arg]));
    }
    case 'forget':     return printResult(await c.forget(arg, true));
    case 'health':     return printResult(await c.health());
    case 'setup':      return (await import('./setup-wizard.mjs')).main();
    case 'status':     return (await import('./ov-status.mjs')).main();
    default:
      process.stderr.write(`Unknown subcommand: ${sub}\n`);
      process.stdout.write(help());
      process.exit(2);
  }
}

function help() {
  return [
    'ov <subcommand> [args]',
    '',
    'Subcommands:',
    '  remember <text>     store a memory',
    '  recall  <query>     type-quota memory recall',
    '  find    <query>     fast semantic find',
    '  search  <query>     deep semantic search',
    '  read    <uri>       read a viking:// URI',
    '  list    <uri>       list a viking:// directory',
    '  glob    <pattern>   filename glob',
    '  grep    <uri> <re>  regex content search',
    '  forget  <uri>       permanently delete (irreversible)',
    '  health              server liveness',
    '  setup               re-run setup wizard',
    '  status              one-line status',
    '',
  ].join('\n');
}

main().catch(err => { console.error('ov:', err.message); process.exit(1); });