// scripts/lib/capture.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripPollution, turnsToMessages, shouldCapture } from './capture.mjs';

test('stripPollution removes openviking-context blocks', () => {
  const s = 'before\n<openviking-context>\nstuff\n</openviking-context>\nafter';
  // Stripping a multiline block leaves the surrounding \n separators; trim collapses them.
  assert.equal(stripPollution(s).replace(/\n+/g, '\n'), 'before\nafter');
});

test('stripPollution removes multiple known blocks', () => {
  const s = 'a<openviking-context>x</openviking-context>b<system-reminder>y</system-reminder>c<relevant-memories>z</relevant-memories>d[Subagent Context]q';
  assert.equal(stripPollution(s), 'abcd');
});

test('turnsToMessages keeps user/assistant alternation', () => {
  const turns = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
  ];
  const m = turnsToMessages(turns);
  assert.deepEqual(m, [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]);
});

test('turnsToMessages drops empty / whitespace-only turns', () => {
  const m = turnsToMessages([{ role: 'user', content: '' }, { role: 'user', content: 'real' }]);
  assert.deepEqual(m, [{ role: 'user', content: 'real' }]);
});

test('shouldCapture skips very short queries', () => {
  assert.equal(shouldCapture({ content: 'a', role: 'user' }, { minQueryLength: 3 }), false);
  assert.equal(shouldCapture({ content: 'hello', role: 'user' }, { minQueryLength: 3 }), true);
});

test('shouldCapture respects captureMode=keyword (drops generic assistant chatter)', () => {
  assert.equal(shouldCapture({ content: 'hi', role: 'assistant' }, { captureMode: 'keyword' }), false);
  assert.equal(shouldCapture({ content: 'remember this: project uses TypeScript', role: 'user' }, { captureMode: 'keyword' }), true);
});