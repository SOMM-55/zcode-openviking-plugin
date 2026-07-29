// scripts/lib/recall.mjs
// Takes raw items from `find` / `search` and produces a final list of
// inline-or-hinted items respecting minScore, recallLimit, and token budget.

function approxTokens(s) {
  // ~4 chars per token, conservative.
  return Math.ceil((s || '').length / 4);
}

export function rankAndBudget(items, { minScore = 0.35, recallLimit = 6, tokenBudget = 2000, maxContentChars = 500 } = {}) {
  const filtered = (items || [])
    .filter(it => typeof it?.score === 'number' && it.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, recallLimit);

  let remaining = tokenBudget;
  const out = [];
  for (const it of filtered) {
    const abstractText = it.abstract || '';
    const contentText = (it.content || '').slice(0, maxContentChars);
    const inline = `${abstractText} ${contentText}`.trim();
    const tokens = approxTokens(inline);
    if (tokens <= remaining && inline.length > 0) {
      out.push({ uri: it.uri, abstract: abstractText, content: contentText, display: inline, score: it.score, kind: it.kind || 'memory' });
      remaining -= tokens;
    } else {
      out.push({ uri: it.uri, abstract: abstractText, content: '', display: `hint: ${it.uri}`, score: it.score, kind: it.kind || 'memory' });
    }
  }
  return out;
}

export function formatContextBlock(items) {
  if (!items || items.length === 0) return '';
  const lines = items.map(it => {
    const tag = it.kind ? `[${it.kind}]` : '[memory]';
    return `${tag} ${it.uri} (${(it.score ?? 0).toFixed(2)})\n    ${it.display}`;
  });
  return `<openviking-context>\n${lines.join('\n')}\n</openviking-context>`;
}

export { approxTokens };