// scripts/lib/capture.mjs
// Helpers for parsing the ZCode transcript into clean OV messages.

const POLLUTION_PATTERNS = [
  /<openviking-context>[\s\S]*?<\/openviking-context>/g,
  /<system-reminder>[\s\S]*?<\/system-reminder>/g,
  /<relevant-memories>[\s\S]*?<\/relevant-memories>/g,
  /\[Subagent Context\][\s\S]*?(?=\n\n|$)/g,
];

export function stripPollution(text) {
  if (!text) return '';
  let s = text;
  for (const p of POLLUTION_PATTERNS) s = s.replace(p, '');
  return s.trim();
}

export function turnsToMessages(turns) {
  const out = [];
  for (const t of turns || []) {
    if (!t || typeof t.content !== 'string') continue;
    const clean = stripPollution(t.content);
    if (!clean) continue;
    if (t.role !== 'user' && t.role !== 'assistant') continue;
    if (clean.length > 24000) continue; // captureMaxLength default; caller may override
    out.push({ role: t.role, content: clean });
  }
  return out;
}

const KEYWORD_TRIGGERS = /\b(remember|note this|important:|don't forget|keep in mind|preference|convention|decision)\b/i;

export function shouldCapture(turn, opts = {}) {
  const { minQueryLength = 3, captureMode = 'semantic' } = opts;
  const c = stripPollution(turn?.content || '');
  if (c.length < minQueryLength) return false;
  if (captureMode === 'keyword') {
    if (turn.role === 'assistant') return false;
    return KEYWORD_TRIGGERS.test(c);
  }
  // semantic mode: capture all non-trivial turns
  return true;
}