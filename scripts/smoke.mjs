// scripts/smoke.mjs
// Live integration smoke against the configured OV server.
// Exits 0 on success, non-zero on failure.
import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { OvClient, probeOvServer } from './lib/ov-client.mjs';

const NOTE = `Smoke ${new Date().toISOString()} — ZCode plugin integration test.`;

async function main() {
  const cfg = resolveConfig({ mcpDiscovered: await discoverOpenVikingMcp() });
  const probe = await probeOvServer(cfg.url);
  if (!probe.ok) throw new Error(`OV unreachable at ${cfg.url}`);
  const c = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: cfg.timeoutMs, sessionId: probe.sessionId });
  await c.initialize();
  const tools = await c.listTools();
  console.log(`tools: ${tools.length}`);
  const store = await c.remember([{ role: 'user', content: NOTE }]);
  console.log(`store: ${store?.content?.[0]?.text}`);
  await new Promise(r => setTimeout(r, 3000));
  const find = await c.find({ query: NOTE, limit: 3 });
  console.log(`recall:\n${find?.content?.[0]?.text}`);
  if (!/Found \d+ item/.test(find?.content?.[0]?.text || '')) {
    throw new Error('No items returned from find after remember — async extraction may need more time.');
  }
}

main().catch(err => { console.error('SMOKE FAIL:', err.message); process.exit(1); });