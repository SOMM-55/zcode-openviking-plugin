// scripts/uri-guard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

async function runUriGuard(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['./scripts/uri-guard.mjs'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      if (code !== 0 && !out) return reject(new Error(`exit ${code}: ${err}`));
      try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`non-JSON output: ${out}\nstderr: ${err}`)); }
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

test('blocks Read on viking:// URI', async () => {
  const out = await runUriGuard({ tool_name: 'Read', tool_input: { file_path: 'viking://user/default/memories/identity.md' } });
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /viking:\/\/user\/default/);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /mcp__openviking__read/);
});

test('allows Read on non-viking path', async () => {
  const out = await runUriGuard({ tool_name: 'Read', tool_input: { file_path: '/etc/hosts' } });
  assert.equal(out.continue, true);
  assert.equal(out.hookSpecificOutput, undefined);
});

test('blocks Glob on viking:// pattern', async () => {
  const out = await runUriGuard({ tool_name: 'Glob', tool_input: { pattern: 'viking://**/*.md' } });
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /mcp__openviking__list/);
});

test('blocks Grep on viking:// URI', async () => {
  const out = await runUriGuard({ tool_name: 'Grep', tool_input: { path: 'viking://user/default/memories', pattern: 'foo' } });
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /mcp__openviking__grep/);
});

test('allows when tool is not in matcher set', async () => {
  const out = await runUriGuard({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  assert.equal(out.continue, true);
  assert.equal(out.hookSpecificOutput, undefined);
});