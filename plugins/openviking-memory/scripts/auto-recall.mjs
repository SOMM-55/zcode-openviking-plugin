// scripts/auto-recall.mjs
// ZCode UserPromptSubmit hook. Reads the prompt from stdin, queries OV
// via find/search, ranks within budget, prints a <openviking-context> block
// via stdout (ZCode merges hook stdout into the next model input).

import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { OvClient } from './lib/ov-client.mjs';
import { derivePeerId } from './lib/session.mjs';
import { rankAndBudget, formatContextBlock } from './lib/recall.mjs';
import { debug } from './lib/debug-log.mjs';

async function readStdin() {
  return new Promise((resolve) => {
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
  try { hookInput = JSON.parse(raw); } catch { /* tolerate non-JSON */ }
  const prompt = String(hookInput.prompt || hookInput.user_message || hookInput.input || '');
  if (!prompt) { process.stdout.write('{}'); return; }

  const cfg = resolveConfig({ mcpDiscovered: await discoverOpenVikingMcp() });
  if (process.env.OPENVIKING_MEMORY_ENABLED === '0') { process.stdout.write('{}'); return; }
  if (prompt.length < cfg.recallMinQueryLength) { process.stdout.write('{}'); return; }

  const peer = cfg.workspacePeer ? derivePeerId(process.cwd()) : '';
  const client = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: cfg.timeoutMs });
  await client.initialize();
  let items = [];
  try {
    // Search globally by default. Peer-scoped narrowing happens server-side
    // when memories exist under that peer; passing a target_uri with no
    // matching memory would falsely return empty.
    const r = await client.find({ query: prompt, limit: cfg.recallLimit, min_score: cfg.recallMinScore });
    items = parseItems(r);
  } catch (err) {
    await debug('recall:err', { message: err.message });
    process.stdout.write('{}'); return;
  }

  const ranked = rankAndBudget(items, {
    minScore: cfg.recallMinScore,
    recallLimit: cfg.recallLimit,
    tokenBudget: cfg.recallTokenBudget,
    maxContentChars: cfg.recallMaxContentChars,
  });
  const block = formatContextBlock(ranked);
  await debug('recall:done', { count: ranked.length, budget: cfg.recallTokenBudget });

  // ZCode hook output: print JSON to stdout. The harness merges additionalContext into the prompt.
  const out = block ? { hookSpecificOutput: { additionalContext: block }, continue: true } : { continue: true };
  process.stdout.write(JSON.stringify(out));
}

function parseItems(rpcResult) {
  // The MCP `find` tool returns content[0].text as a plain-text block listing
  // items. For v1 we parse the well-known format; richer parsing can move
  // into `search` later.
  const text = rpcResult?.content?.[0]?.text || '';
  const items = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^- \[(\w+)\s+(\d+)%\] (\S+)\s*(.*)$/);
    if (!m) continue;
    items.push({ kind: m[1], score: Number(m[2]) / 100, uri: m[3], abstract: m[4].trim() });
  }
  return items;
}

main().catch(err => { console.error('OV recall failed:', err.message); process.stdout.write('{}'); });