// scripts/lib/mcp-discovery.mjs
// Pure functions for reading ZCode MCP config and pulling out the
// openviking-named server. Operates on a parsed JSON object so callers
// can pass either ~/.zcode/cli/config.json (mcp.servers) or
// .agents/mcp.json (mcpServers fallback).

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const NAME_RE = /^openviking(-memory|-mcp)?$/i;

export function findOpenVikingMcpEntry(configObj) {
  if (!configObj || typeof configObj !== 'object') return null;
  const buckets = [];
  if (configObj.mcp?.servers && typeof configObj.mcp.servers === 'object') buckets.push(configObj.mcp.servers);
  if (configObj.mcpServers && typeof configObj.mcpServers === 'object') buckets.push(configObj.mcpServers);
  for (const bucket of buckets) {
    for (const [name, entry] of Object.entries(bucket)) {
      if (!NAME_RE.test(name)) continue;
      if (!entry || typeof entry !== 'object') continue;
      // Pick the first matching entry. Prefer http entries; fall back to stdio with command.
      if (entry.url || entry.type === 'http' || entry.type === 'sse') {
        return { name, url: entry.url, headers: entry.headers || {}, type: entry.type || 'http' };
      }
      if (entry.command) {
        // stdio entry — useful for documentation; we still extract what we can
        return { name, type: 'stdio', command: entry.command, args: entry.args || [], env: entry.env || {} };
      }
    }
  }
  return null;
}

export async function loadUserMcpConfig() {
  const path = join(homedir(), '.zcode', 'cli', 'config.json');
  try {
    const text = await readFile(path, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    return null; // malformed — caller falls back to defaults
  }
}

export async function loadWorkspaceMcpConfig(cwd) {
  if (!cwd) return null;
  for (const candidate of [join(cwd, '.zcode', 'config.json'), join(cwd, 'zcode.json'), join(cwd, '.agents', 'mcp.json')]) {
    try {
      const text = await readFile(candidate, 'utf8');
      return JSON.parse(text);
    } catch { /* try next */ }
  }
  return null;
}

/**
 * High-level: discover the openviking MCP entry from user + workspace config.
 * Workspace entries take priority (the most-local override).
 */
export async function discoverOpenVikingMcp({ cwd = process.cwd() } = {}) {
  const ws = await loadWorkspaceMcpConfig(cwd);
  const fromWs = findOpenVikingMcpEntry(ws);
  if (fromWs) return fromWs;
  const user = await loadUserMcpConfig();
  return findOpenVikingMcpEntry(user);
}