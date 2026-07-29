// scripts/lib/debug-log.mjs
// Writes to ~/.zcode/openviking/logs/zcode-hooks.log when OPENVIKING_DEBUG=1
import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

let debugEnabled = null;
let logPath = null;

async function ensure() {
  if (debugEnabled !== null) return debugEnabled;
  debugEnabled = process.env.OPENVIKING_DEBUG === '1' || process.env.OPENVIKING_DEBUG === 'true';
  logPath = process.env.OPENVIKING_DEBUG_LOG || join(homedir(), '.zcode', 'openviking', 'logs', 'zcode-hooks.log');
  if (debugEnabled) {
    await mkdir(join(homedir(), '.zcode', 'openviking', 'logs'), { recursive: true });
  }
  return debugEnabled;
}

export async function debug(tag, data) {
  if (!(await ensure())) return;
  const ts = new Date().toISOString();
  const line = `${ts} ${tag} ${typeof data === 'string' ? data : JSON.stringify(data)}\n`;
  try { await appendFile(logPath, line, 'utf8'); } catch { /* never throw from logger */ }
}

export function isDebug() {
  return process.env.OPENVIKING_DEBUG === '1' || process.env.OPENVIKING_DEBUG === 'true';
}