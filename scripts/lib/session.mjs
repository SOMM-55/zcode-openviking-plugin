// scripts/lib/session.mjs
import { createHash } from 'node:crypto';

/**
 * Derive a workspace peer id. Every non-alphanumeric char becomes '-'.
 * Mirrors the OpenViking reference plugin's rule. Pass `''` to disable peer
 * (returns empty string).
 */
export function derivePeerId(cwd) {
  if (!cwd) return '';
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

/**
 * Stable OV session id derived from a ZCode session id. One ZCode session
 * maps to one OV session so all hook events target the same archive.
 */
export function deriveOvSessionId(zcodeSessionId) {
  const hash = createHash('sha256').update(String(zcodeSessionId)).digest('hex').slice(0, 32);
  return `zcode-${hash}`;
}