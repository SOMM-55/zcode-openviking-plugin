// scripts/lib/session.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivePeerId, deriveOvSessionId } from './session.mjs';

test('derivePeerId replaces non-alphanumerics with dashes', () => {
  assert.equal(derivePeerId('/Users/x/Dev/OpenViking'), '-Users-x-Dev-OpenViking');
});

test('derivePeerId returns empty string for empty input', () => {
  assert.equal(derivePeerId(''), '');
});

test('deriveOvSessionId is stable for same input', () => {
  const a = deriveOvSessionId('session-abc-123');
  const b = deriveOvSessionId('session-abc-123');
  assert.equal(a, b);
  assert.match(a, /^zcode-[0-9a-f]{16,}$/);
});

test('deriveOvSessionId differs for different inputs', () => {
  assert.notEqual(deriveOvSessionId('a'), deriveOvSessionId('b'));
});