// scripts/uri-guard.mjs
// ZCode PreToolUse hook. If a model tries to use Read/Glob/Grep on a
// viking:// URI, deny the tool call and tell the model to use the
// OpenViking MCP tools (read/list/glob/grep) instead.
//
// Only fires for Read|Glob|Grep — the matcher in hooks.json.

import { readFileSync } from 'node:fs';

const TOOL_HINTS = {
  Read: {
    tool: 'mcp__openviking__read',
    example: (uri) => `mcp__openviking__read({ uris: ["${uri}"] })`,
  },
  Glob: {
    tool: 'mcp__openviking__glob (or list)',
    example: (uri) => `mcp__openviking__list({ uri: "${uri}", recursive: true })`,
  },
  Grep: {
    tool: 'mcp__openviking__grep',
    example: (uri) => `mcp__openviking__grep({ uri: "${uri}", pattern: ["<your-regex>"] })`,
  },
};

function findVikingUri(input) {
  if (!input || typeof input !== 'object') return null;
  // Read: file_path or path
  for (const k of ['file_path', 'path', 'notebook_path']) {
    if (typeof input[k] === 'string' && input[k].startsWith('viking://')) return input[k];
  }
  // Glob: pattern or path
  for (const k of ['pattern', 'path']) {
    if (typeof input[k] === 'string' && input[k].startsWith('viking://')) return input[k];
  }
  // Grep: path
  for (const k of ['path', 'uri']) {
    if (typeof input[k] === 'string' && input[k].startsWith('viking://')) return input[k];
  }
  return null;
}

async function readStdin() {
  return new Promise(resolve => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => buf += d);
    process.stdin.on('end', () => resolve(buf));
    process.stdin.resume();
  });
}

function buildMessage(toolName, uri) {
  const hint = TOOL_HINTS[toolName];
  if (!hint) return '';
  return [
    `Cannot use ${toolName} on a viking:// URI — these live in the OpenViking server, not the local filesystem.`,
    `Use the OpenViking MCP tool instead:`,
    `  ${hint.example(uri)}`,
    `Or /ov read ${uri}`,
  ].join('\n');
}

async function main() {
  const raw = await readStdin();
  let payload = {};
  try { payload = JSON.parse(raw); } catch { /* tolerate non-JSON */ }
  const toolName = payload.tool_name || payload.toolName || payload.name;
  const toolInput = payload.tool_input || payload.toolInput || payload.input || {};
  const uri = findVikingUri(toolInput);
  if (!uri) {
    // Allow — nothing to redirect
    process.stdout.write(JSON.stringify({ continue: true }) + '\n');
    return;
  }
  const msg = buildMessage(toolName, uri);
  process.stdout.write(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: msg,
    },
  }) + '\n');
}

main().catch(err => { console.error('OV uri-guard:', err.message); process.stdout.write(JSON.stringify({ continue: true }) + '\n'); });