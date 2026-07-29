// scripts/lib/recall.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankAndBudget, formatContextBlock } from './recall.mjs';

test('drops items below minScore', () => {
  const items = [
    { uri: 'a', abstract: 'A', score: 0.9 },
    { uri: 'b', abstract: 'B', score: 0.2 },
  ];
  const out = rankAndBudget(items, { minScore: 0.35, recallLimit: 5, tokenBudget: 1000, maxContentChars: 500 });
  assert.equal(out.length, 1);
  assert.equal(out[0].uri, 'a');
});

test('caps by recallLimit', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ uri: `u${i}`, abstract: 'x'.repeat(50), score: 0.5 + i * 0.01 }));
  const out = rankAndBudget(items, { minScore: 0.1, recallLimit: 3, tokenBudget: 10000, maxContentChars: 500 });
  assert.equal(out.length, 3);
});

test('degrades abstract to URI hint when over budget', () => {
  const items = [
    { uri: 'viking://a', abstract: 'A', content: 'long '.repeat(500), score: 0.9 },
    { uri: 'viking://b', abstract: 'B', content: 'x'.repeat(10), score: 0.8 },
  ];
  const out = rankAndBudget(items, { minScore: 0.1, recallLimit: 5, tokenBudget: 50, maxContentChars: 500 });
  // 'a' over budget → degraded to URI hint; 'b' stays inline
  assert.equal(out[0].uri, 'viking://a');
  assert.match(out[0].display, /^hint: viking:\/\/a/);
  assert.equal(out[1].uri, 'viking://b');
  assert.match(out[1].display, /x+/);
});

test('formatContextBlock wraps output', () => {
  const items = [{ uri: 'viking://a', abstract: 'hello', display: 'hello' }];
  const block = formatContextBlock(items);
  assert.match(block, /<openviking-context>/);
  assert.match(block, /viking:\/\/a/);
  assert.match(block, /hello/);
  assert.match(block, /<\/openviking-context>/);
});