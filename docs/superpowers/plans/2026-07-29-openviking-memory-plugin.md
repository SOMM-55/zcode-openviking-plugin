# OpenViking Memory Plugin for ZCode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a ZCode plugin that gives ZCode agents long-term semantic memory via OpenViking — auto-recall on each prompt, auto-capture on each turn, an `openviking-usage` skill, `/ov` and `/ov-status` slash commands, and a setup wizard that discovers or creates the underlying MCP server entry.

**Architecture:** Approach C from the design — hook scripts call OpenViking directly over HTTP (faithful to the Claude-Code reference plugin), but config discovery reads `~/.zcode/cli/config.json` for an existing `openviking` MCP entry so the plugin and the MCP tools share one source of truth. No runtime npm deps. `package.json` is `type: module` only.

**Tech Stack:** Node.js 18+ (uses `fetch`, `node:test`, `node:fs/promises`), pure ESM `.mjs` scripts, Markdown. Cross-platform (Windows + macOS + Linux).

**Reference docs**:
- Spec: `docs/superpowers/specs/2026-07-29-openviking-memory-plugin-design.md`
- Reference plugin (read-only, for shape): `C:/Users/OMID/AppData/Local/Temp/ov_ref/claude-code-memory-plugin/`
- Plugin target dir: `C:/Users/OMID/Code/openviking-memory/`
- Live OV server: `http://127.0.0.1:1933/mcp` (already verified working in earlier turn)

---

## File map

```
openviking-memory/
├── .zcode-plugin/
│   └── plugin.json              # manifest
├── skills/
│   └── openviking-usage/
│       ├── SKILL.md
│       └── references/
│           ├── tools.md
│           ├── patterns.md
│           └── troubleshooting.md
├── commands/
│   ├── ov.md
│   └── ov-status.md
├── hooks/
│   └── hooks.json
├── scripts/
│   ├── lib/
│   │   ├── config.mjs
│   │   ├── mcp-discovery.mjs
│   │   ├── ov-client.mjs
│   │   ├── session.mjs
│   │   ├── recall.mjs
│   │   ├── capture.mjs
│   │   ├── async-writer.mjs
│   │   ├── debug-log.mjs
│   │   └── *.test.mjs
│   ├── setup-wizard.mjs
│   ├── ov.mjs
│   ├── ov-status.mjs
│   ├── session-start.mjs
│   ├── auto-recall.mjs
│   ├── auto-capture.mjs
│   ├── session-end.mjs
│   ├── pre-compact.mjs
│   └── smoke.mjs
├── README.md
└── package.json
```

Files split by responsibility: `config` for resolution, `mcp-discovery` for MCP JSON reading, `ov-client` for HTTP, `session` for ids, `recall` for ranking, `capture` for transcript processing. Each lib module has a colocated `.test.mjs`.

---

## Task 1: Plugin skeleton + manifest

**Files:**
- Create: `C:/Users/OMID/Code/openviking-memory/.zcode-plugin/plugin.json`
- Create: `C:/Users/OMID/Code/openviking-memory/package.json`
- Create: `C:/Users/OMID/Code/openviking-memory/README.md`
- Create: `C:/Users/OMID/Code/openviking-memory/.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "openviking-memory",
  "version": "0.1.0",
  "description": "Long-term semantic memory for ZCode, powered by OpenViking. Auto-recall relevant memories at session start and capture important information during conversations.",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test scripts/lib/*.test.mjs"
  },
  "author": { "name": "OpenViking port for ZCode" },
  "license": "Apache-2.0"
}
```

- [ ] **Step 2: Create `.zcode-plugin/plugin.json`**

```json
{
  "name": "openviking-memory",
  "version": "0.1.0",
  "description": "Long-term semantic memory for ZCode, powered by OpenViking. Auto-recall relevant memories at session start and capture important information during conversations.",
  "author": { "name": "OpenViking port for ZCode" },
  "license": "Apache-2.0",
  "keywords": ["memory", "openviking", "semantic-search", "long-term-memory"],
  "skills": "skills"
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
*.log
.DS_Store
dist/
```

- [ ] **Step 4: Create stub `README.md`**

```markdown
# openviking-memory (ZCode port)

See `docs/superpowers/specs/2026-07-29-openviking-memory-plugin-design.md` for design and `docs/superpowers/plans/2026-07-29-openviking-memory-plugin.md` for the implementation plan.
```

- [ ] **Step 5: Verify Node sees the package**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node -e "import('./package.json', { with: { type: 'json' } }).then(p => console.log(p.default.type))"`
Expected: `module`

---

## Task 2: First lib module — `session.mjs` + test

**Files:**
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/lib/session.mjs`
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/lib/session.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node --test scripts/lib/session.test.mjs`
Expected: FAIL — `Cannot find module './session.mjs'`.

- [ ] **Step 3: Implement `session.mjs`**

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node --test scripts/lib/session.test.mjs`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/OMID/Code/openviking-memory"
git init -q 2>/dev/null
git add .
git commit -m "feat: plugin skeleton + session lib with tests"
```

(If git is not initialized in the parent dir, this task assumes the engineer runs `git init` once at the project root. The reference dir `C:/Users/OMID/Code/` is not a git repo; that's fine — we're treating the plugin as its own repo.)

---

## Task 3: `config.mjs` + test (env vs file vs default precedence)

**Files:**
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/lib/config.mjs`
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/lib/config.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/lib/config.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from './config.mjs';

const savedEnv = { ...process.env };

function reset(env = {}) {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('OPENVIKING_')) delete process.env[k];
  }
  Object.assign(process.env, env);
}

test.afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('OPENVIKING_')) delete process.env[k];
  }
  Object.assign(process.env, savedEnv);
});

test('defaults when nothing set', () => {
  reset();
  const c = resolveConfig({});
  assert.equal(c.url, 'http://127.0.0.1:1933');
  assert.equal(c.apiKey, '');
  assert.equal(c.account, '');
  assert.equal(c.user, '');
  assert.equal(c.recallLimit, 6);
  assert.equal(c.captureMode, 'semantic');
});

test('env vars beat defaults', () => {
  reset({ OPENVIKING_URL: 'https://remote.example', OPENVIKING_API_KEY: 'k1', OPENVIKING_ACCOUNT: 'team', OPENVIKING_USER: 'alice' });
  const c = resolveConfig({});
  assert.equal(c.url, 'https://remote.example');
  assert.equal(c.apiKey, 'k1');
  assert.equal(c.account, 'team');
  assert.equal(c.user, 'alice');
});

test('file values beat defaults but env still wins', () => {
  reset({ OPENVIKING_URL: 'https://env-wins' });
  const c = resolveConfig({ fileConfig: { url: 'https://from-file', apiKey: 'fk', recallLimit: 12 } });
  assert.equal(c.url, 'https://env-wins');
  assert.equal(c.apiKey, 'fk');
  assert.equal(c.recallLimit, 12);
});

test('mcpDiscovered beats file', () => {
  reset();
  const c = resolveConfig({
    fileConfig: { url: 'https://file' },
    mcpDiscovered: { url: 'https://from-mcp', headers: { Authorization: 'Bearer xyz' } },
  });
  assert.equal(c.url, 'https://from-mcp');
  assert.equal(c.headers.Authorization, 'Bearer xyz');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node --test scripts/lib/config.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `config.mjs`**

```javascript
// scripts/lib/config.mjs
// Resolution order (highest wins):
//   1. process.env OPENVIKING_*
//   2. mcpDiscovered (from ~/.zcode/cli/config.json)
//   3. fileConfig (~/.zcode/openviking/config.json)
//   4. built-in defaults

const DEFAULTS = Object.freeze({
  url: 'http://127.0.0.1:1933',
  apiKey: '',
  account: '',
  user: '',
  headers: {},
  recallLimit: 6,
  recallTokenBudget: 2000,
  recallMaxContentChars: 500,
  recallMinScore: 0.35,
  recallMinQueryLength: 3,
  recallPeerScope: 'all',
  captureMode: 'semantic',
  captureMaxLength: 24000,
  captureAssistantTurns: true,
  commitTokenThreshold: 20000,
  writePathAsync: true,
  timeoutMs: 15000,
  captureTimeoutMs: 30000,
  memoryEnabled: null, // null = auto (decide by presence of any config)
  workspacePeer: true,
});

const TUNING_KEYS = [
  'recallLimit', 'recallTokenBudget', 'recallMaxContentChars',
  'recallMinScore', 'recallMinQueryLength', 'recallPeerScope',
  'captureMode', 'captureMaxLength', 'captureAssistantTurns',
  'commitTokenThreshold', 'writePathAsync', 'timeoutMs', 'captureTimeoutMs',
  'workspacePeer',
];

function envToConfig() {
  const out = {};
  if (process.env.OPENVIKING_URL || process.env.OPENVIKING_BASE_URL) {
    out.url = process.env.OPENVIKING_URL || process.env.OPENVIKING_BASE_URL;
  }
  if (process.env.OPENVIKING_API_KEY || process.env.OPENVIKING_BEARER_TOKEN) {
    out.apiKey = process.env.OPENVIKING_API_KEY || process.env.OPENVIKING_BEARER_TOKEN;
  }
  if (process.env.OPENVIKING_ACCOUNT) out.account = process.env.OPENVIKING_ACCOUNT;
  if (process.env.OPENVIKING_USER) out.user = process.env.OPENVIKING_USER;

  const tune = {};
  for (const k of TUNING_KEYS) {
    const envName = `OPENVIKING_${k.replace(/[A-Z]/g, (m) => '_' + m.toUpperCase())}`;
    if (process.env[envName] !== undefined) {
      tune[k] = coerce(process.env[envName], typeof DEFAULTS[k]);
    }
  }
  if (process.env.OPENVIKING_RECALL_LIMIT !== undefined) tune.recallLimit = Number(process.env.OPENVIKING_RECALL_LIMIT);
  if (process.env.OPENVIKING_SCORE_THRESHOLD !== undefined) tune.recallMinScore = Number(process.env.OPENVIKING_SCORE_THRESHOLD);
  if (process.env.OPENVIKING_AUTO_CAPTURE !== undefined) tune.captureMode = truthy(process.env.OPENVIKING_AUTO_CAPTURE) ? 'semantic' : 'off';
  if (process.env.OPENVIKING_CAPTURE_MODE) tune.captureMode = process.env.OPENVIKING_CAPTURE_MODE;
  if (process.env.OPENVIKING_WORKSPACE_PEER !== undefined) tune.workspacePeer = truthy(process.env.OPENVIKING_WORKSPACE_PEER);
  if (process.env.OPENVIKING_MEMORY_ENABLED !== undefined) out.memoryEnabled = truthy(process.env.OPENVIKING_MEMORY_ENABLED);

  Object.assign(out, tune);
  if (out.apiKey) out.headers = { Authorization: `Bearer ${out.apiKey}`, ...(out.headers || {}) };
  return out;
}

function coerce(v, type) {
  if (type === 'number') return Number(v);
  if (type === 'boolean') return truthy(v);
  return v;
}

function truthy(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export function resolveConfig({ fileConfig = {}, mcpDiscovered = null } = {}) {
  const merged = { ...DEFAULTS, ...(fileConfig || {}), ...(mcpDiscovered || {}), ...envToConfig() };
  // Headers: env/mcp headers take precedence; file headers only fill missing keys.
  const headers = { ...(fileConfig.headers || {}), ...(mcpDiscovered?.headers || {}) };
  if (merged.apiKey && !headers.Authorization) headers.Authorization = `Bearer ${merged.apiKey}`;
  if (merged.account) headers['X-OpenViking-Account'] = merged.account;
  if (merged.user) headers['X-OpenViking-User'] = merged.user;
  merged.headers = headers;
  return merged;
}

export const DEFAULT_CONFIG = DEFAULTS;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node --test scripts/lib/config.test.mjs`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/OMID/Code/openviking-memory"
git add scripts/lib/config.mjs scripts/lib/config.test.mjs
git commit -m "feat: config resolver with env/mcp/file/default precedence"
```

---

## Task 4: `mcp-discovery.mjs` + test

**Files:**
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/lib/mcp-discovery.mjs`
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/lib/mcp-discovery.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/lib/mcp-discovery.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOpenVikingMcpEntry } from './mcp-discovery.mjs';

test('matches openviking, openviking-memory, openviking-mcp names', () => {
  const cfg = { mcp: { servers: {
    openviking: { type: 'http', url: 'http://a' },
    openviking_memory: { type: 'http', url: 'http://b' },
    'openviking-mcp': { type: 'http', url: 'http://c' },
    playwright: { type: 'stdio', command: 'x' },
  } } };
  const r = findOpenVikingMcpEntry(cfg);
  assert.equal(r.url, 'http://a');
  assert.equal(r.name, 'openviking');
});

test('returns null when no match', () => {
  const cfg = { mcp: { servers: { playwright: { type: 'stdio', command: 'x' } } } };
  assert.equal(findOpenVikingMcpEntry(cfg), null);
});

test('also reads top-level mcpServers fallback', () => {
  const cfg = { mcpServers: { openviking: { type: 'http', url: 'http://x' } } };
  const r = findOpenVikingMcpEntry(cfg);
  assert.equal(r.url, 'http://x');
});

test('passes through headers', () => {
  const cfg = { mcp: { servers: { openviking: { type: 'http', url: 'http://x', headers: { Authorization: 'Bearer t' } } } } };
  const r = findOpenVikingMcpEntry(cfg);
  assert.equal(r.headers.Authorization, 'Bearer t');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node --test scripts/lib/mcp-discovery.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement `mcp-discovery.mjs`**

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node --test scripts/lib/mcp-discovery.test.mjs`
Expected: 4 tests pass.

- [ ] **Step 5: Smoke-test against the real user config**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node -e "import('./scripts/lib/mcp-discovery.mjs').then(m => m.discoverOpenVikingMcp().then(r => console.log(JSON.stringify(r))))"`
Expected: prints `{"name":"openviking","url":"http://127.0.0.1:1933/mcp",...}`.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/OMID/Code/openviking-memory"
git add scripts/lib/mcp-discovery.mjs scripts/lib/mcp-discovery.test.mjs
git commit -m "feat: MCP discovery reads openviking entries from zcode config"
```

---

## Task 5: `ov-client.mjs` (HTTP + JSON-RPC) + test

**Files:**
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/lib/ov-client.mjs`
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/lib/ov-client.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/lib/ov-client.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OvClient } from './ov-client.mjs';

// Fake fetch that records calls and returns canned responses.
function fakeFetch(responses) {
  const calls = [];
  const queue = [...responses];
  return {
    calls,
    fn: async (url, init) => {
      calls.push({ url, init });
      const next = queue.shift();
      if (!next) throw new Error('no more canned responses');
      return new Response(next.body, { status: next.status ?? 200, headers: next.headers ?? { 'content-type': 'application/json' } });
    },
  };
}

test('initialize sends the right JSON-RPC payload', async () => {
  const f = fakeFetch([{ body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'ov' }, protocolVersion: '2024-11-05' } }), headers: { 'mcp-session-id': 'sess-1' } }]);
  const c = new OvClient({ url: 'http://x/mcp', fetch: f.fn });
  const res = await c.initialize();
  assert.equal(f.calls[0].url, 'http://x/mcp');
  assert.equal(f.calls[0].init.method, 'POST');
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.method, 'initialize');
  assert.equal(c.sessionId, 'sess-1');
});

test('toolsCall wraps the MCP tool call envelope', async () => {
  const f = fakeFetch([{ body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'ok' }], isError: false } }) }]);
  const c = new OvClient({ url: 'http://x/mcp', fetch: f.fn, sessionId: 'sess-1' });
  const res = await c.toolsCall('remember', { messages: [{ role: 'user', content: 'hi' }] });
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.method, 'tools/call');
  assert.equal(body.params.name, 'remember');
  assert.equal(f.calls[0].init.headers['mcp-session-id'], 'sess-1');
  assert.equal(res.isError, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node --test scripts/lib/ov-client.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement `ov-client.mjs`**

```javascript
// scripts/lib/ov-client.mjs
// Thin MCP-over-HTTP client. One OvClient = one persistent session.
// Uses Node 18+ global fetch; fetch can be overridden in tests.

const PROTOCOL_VERSION = '2024-11-05';

export class OvError extends Error {
  constructor(message, { code, data } = {}) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

export class OvClient {
  constructor({ url, headers = {}, timeoutMs = 15000, fetch: fetchFn, sessionId = null, clientInfo = { name: 'openviking-memory-zcode', version: '0.1.0' } } = {}) {
    if (!url) throw new Error('OvClient: url is required');
    this.url = url;
    this.headers = { Accept: 'application/json, text/event-stream', ...headers };
    this.timeoutMs = timeoutMs;
    this.fetch = fetchFn || globalThis.fetch;
    this.sessionId = sessionId;
    this.clientInfo = clientInfo;
  }

  async _request(method, params) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const headers = { 'Content-Type': 'application/json', ...this.headers };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    const text = await res.text();
    let evt;
    try {
      evt = parseSse(text) || JSON.parse(text);
    } catch {
      throw new OvError(`non-JSON response: ${text.slice(0, 200)}`);
    }
    if (evt?.error) throw new OvError(evt.error.message || 'RPC error', { code: evt.error.code, data: evt.error.data });
    return evt?.result;
  }

  async initialize() {
    const result = await this._request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: this.clientInfo,
    });
    // Best-effort notification; ignore errors.
    try { await this._request('notifications/initialized', {}); } catch { /* */ }
    return result;
  }

  async listTools() {
    const r = await this._request('tools/list', {});
    return r?.tools || [];
  }

  async toolsCall(name, args) {
    return this._request('tools/call', { name, arguments: args || {} });
  }

  // Convenience wrappers for the common tools.
  find(args)        { return this.toolsCall('find', args); }
  search(args)      { return this.toolsCall('search', args); }
  recall(args)      { return this.toolsCall('recall', args); }
  remember(messages){ return this.toolsCall('remember', { messages }); }
  read(uris)        { return this.toolsCall('read', { uris }); }
  list(uri, recursive = false) { return this.toolsCall('list', { uri, recursive }); }
  forget(uri, recursive = false) { return this.toolsCall('forget', { uri, recursive }); }
  glob(pattern, uri = 'viking://') { return this.toolsCall('glob', { pattern, uri }); }
  grep(uri, patterns, opts = {}) { return this.toolsCall('grep', { uri, pattern: patterns, ...opts }); }
  health()          { return this.toolsCall('health', {}); }
}

function parseSse(text) {
  // SSE: blocks separated by blank lines; data lines start with "data: ".
  const blocks = text.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
    if (!data) continue;
    try { return JSON.parse(data); } catch { /* */ }
  }
  return null;
}

export async function probeOvServer(url, timeoutMs = 3000) {
  try {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'initialize',
          params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'ov-probe', version: '0' } },
        }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    return res.headers.get('mcp-session-id') ? { ok: true, sessionId: res.headers.get('mcp-session-id') } : { ok: false };
  } catch {
    return { ok: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node --test scripts/lib/ov-client.test.mjs`
Expected: 2 tests pass.

- [ ] **Step 5: Live smoke against `127.0.0.1:1933`**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node -e "import('./scripts/lib/ov-client.mjs').then(async m => { const c = new m.OvClient({ url: 'http://127.0.0.1:1933/mcp' }); const r = await c.initialize(); const tools = await c.listTools(); console.log('protocol:', r.protocolVersion, 'tools:', tools.length); })"`
Expected: prints `protocol: 2024-11-05 tools: 16`.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/OMID/Code/openviking-memory"
git add scripts/lib/ov-client.mjs scripts/lib/ov-client.test.mjs
git commit -m "feat: MCP-over-HTTP client + probe"
```

---

## Task 6: `recall.mjs` (search → rank → budget → format) + test

**Files:**
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/lib/recall.mjs`
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/lib/recall.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
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
  const items = [{ uri: 'a', abstract: 'hello', display: 'hello' }];
  const block = formatContextBlock(items);
  assert.match(block, /<openviking-context>/);
  assert.match(block, /viking:\/\/a/);
  assert.match(block, /hello/);
  assert.match(block, /<\/openviking-context>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node --test scripts/lib/recall.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement `recall.mjs`**

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node --test scripts/lib/recall.test.mjs`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/OMID/Code/openviking-memory"
git add scripts/lib/recall.mjs scripts/lib/recall.test.mjs
git commit -m "feat: recall ranking + token budget + context formatter"
```

---

## Task 7: `capture.mjs` (transcript parse, pollution strip, batch) + test

**Files:**
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/lib/capture.mjs`
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/lib/capture.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/lib/capture.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripPollution, turnsToMessages, shouldCapture } from './capture.mjs';

test('stripPollution removes openviking-context blocks', () => {
  const s = 'before\n<openviking-context>\nstuff\n</openviking-context>\nafter';
  assert.equal(stripPollution(s), 'before\nafter');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node --test scripts/lib/capture.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement `capture.mjs`**

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node --test scripts/lib/capture.test.mjs`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/OMID/Code/openviking-memory"
git add scripts/lib/capture.mjs scripts/lib/capture.test.mjs
git commit -m "feat: capture pollution strip + turn filtering"
```

---

## Task 8: `async-writer.mjs` + `debug-log.mjs`

**Files:**
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/lib/async-writer.mjs`
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/lib/debug-log.mjs`

- [ ] **Step 1: Implement `debug-log.mjs`**

```javascript
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
```

- [ ] **Step 2: Implement `async-writer.mjs`**

```javascript
// scripts/lib/async-writer.mjs
// Detached worker helper for Stop / SessionEnd hooks. The parent hook
// drains stdin, prints `{}` (or decision:approve) immediately, then spawns
// a background clone to do the actual HTTP work — the user never waits.

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function detachAndRun({ scriptPath, payload, env = {} }) {
  const here = dirname(fileURLToPath(import.meta.url));
  const childScript = resolve(here, '..', scriptPath);
  const child = spawn(process.execPath, [childScript], {
    detached: true,
    stdio: ['pipe', 'ignore', 'ignore'],
    env: { ...process.env, ...env, OPENVIKING_DETACHED: '1' },
  });
  child.unref();
  try {
    child.stdin.write(JSON.stringify(payload || {}));
    child.stdin.end();
  } catch { /* */ }
}

export function approve() {
  // Emit the standard "approve immediately" JSON for ZCode hook outputs.
  process.stdout.write(JSON.stringify({ continue: true, decision: 'approve' }) + '\n');
}
```

- [ ] **Step 3: Verify both modules load**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node -e "import('./scripts/lib/async-writer.mjs').then(m => console.log(typeof m.detachAndRun, typeof m.approve))"`
Expected: `function function`.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/OMID/Code/openviking-memory"
git add scripts/lib/async-writer.mjs scripts/lib/debug-log.mjs
git commit -m "feat: detached async-writer + debug log helper"
```

---

## Task 9: `setup-wizard.mjs` + `auto-recall.mjs` + `session-start.mjs`

**Files:**
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/setup-wizard.mjs`
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/auto-recall.mjs`
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/session-start.mjs`

- [ ] **Step 1: Implement `setup-wizard.mjs`**

```javascript
// scripts/setup-wizard.mjs
// Discovers or creates the openviking MCP server entry. Non-interactive
// mode (env vars set or already configured) just probes and exits.
// Interactive mode (TTY) prompts for URL / key / account / user.

import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { OvClient, probeOvServer } from './lib/ov-client.mjs';
import { debug } from './lib/debug-log.mjs';

async function ensureLocal() {
  const r = await probeOvServer('http://127.0.0.1:1933/mcp');
  return r.ok ? { url: 'http://127.0.0.1:1933', headers: {} } : null;
}

async function tryDiscover() {
  const entry = await discoverOpenVikingMcp();
  if (!entry?.url) return null;
  const r = await probeOvServer(entry.url);
  return r.ok ? entry : null;
}

function prompt(question) {
  // Minimal TTY prompt; falls back to stdin readline when available.
  process.stdout.write(`${question}: `);
  return new Promise(resolve => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', d => { buf = d.toString().trim(); resolve(buf); });
    process.stdin.resume();
  });
}

async function interactiveConfigure() {
  const url = await prompt('OpenViking URL (default http://127.0.0.1:1933)');
  const apiKey = await prompt('API key (blank for none)')
  const account = await prompt('Account (blank for none)')
  const user = await prompt('User (blank for none)')
  return { url: url || 'http://127.0.0.1:1933', apiKey, account, user };
}

async function main() {
  await debug('setup:start');
  let chosen = await ensureLocal() || await tryDiscover();
  if (!chosen && process.env.OPENVIKING_NONINTERACTIVE !== '1') {
    if (process.stdin.isTTY) {
      chosen = await interactiveConfigure();
    } else {
      console.error('OV: not configured and non-interactive. Set OPENVIKING_URL / OPENVIKING_API_KEY.');
      process.exit(2);
    }
  }
  if (!chosen) { process.exit(2); }
  const cfg = resolveConfig({ mcpDiscovered: chosen });
  const client = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: 8000 });
  await client.initialize();
  await debug('setup:ok', { url: cfg.url });
  console.log(`OV: configured → ${cfg.url}`);
}

main().catch(err => { console.error('OV setup failed:', err.message); process.exit(1); });
```

- [ ] **Step 2: Implement `auto-recall.mjs`**

```javascript
// scripts/auto-recall.mjs
// ZCode UserPromptSubmit hook. Reads the prompt from stdin, queries OV
// via find/search, ranks within budget, prints a <openviking-context> block
// via stdout (ZCode merges hook stdout into the next model input).

import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { OvClient } from './lib/ov-client.mjs';
import { derivePeerId } from './lib/session.mjs';
import { rankAndBudget, formatContextBlock } from './lib/recall.mjs';
import { debug } from './lib/debug-log.mjs';

async function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => buf += d);
    process.stdin.on('end', () => resolve(buf));
    process.stdin.resume();
  });
}

async function main() {
  const raw = await readStdin();
  let hookInput = {};
  try { hookInput = JSON.parse(raw); } catch { /* tolerate non-JSON */ }
  const prompt = String(hookInput.prompt || hookInput.user_message || hookInput.input || '');
  if (!prompt) { process.stdout.write('{}'); return; }

  const cfg = resolveConfig({ mcpDiscovered: await discoverOpenVikingMcp() });
  if (process.env.OPENVIKING_MEMORY_ENABLED === '0') { process.stdout.write('{}'); return; }
  if (prompt.length < cfg.recallMinQueryLength) { process.stdout.write('{}'); return; }

  const peer = cfg.workspacePeer ? derivePeerId(process.cwd()) : '';
  const client = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: cfg.timeoutMs });
  await client.initialize();
  let items = [];
  try {
    const r = await client.find({ query: prompt, limit: cfg.recallLimit, min_score: cfg.recallMinScore, ...(peer ? { target_uri: `viking://user/${peer}` } : {}) });
    items = parseItems(r);
  } catch (err) {
    await debug('recall:err', { message: err.message });
    process.stdout.write('{}'); return;
  }

  const ranked = rankAndBudget(items, {
    minScore: cfg.recallMinScore,
    recallLimit: cfg.recallLimit,
    tokenBudget: cfg.recallTokenBudget,
    maxContentChars: cfg.recallMaxContentChars,
  });
  const block = formatContextBlock(ranked);
  await debug('recall:done', { count: ranked.length, budget: cfg.recallTokenBudget });

  // ZCode hook output: print JSON to stdout. The harness merges additionalContext into the prompt.
  const out = block ? { hookSpecificOutput: { additionalContext: block }, continue: true } : { continue: true };
  process.stdout.write(JSON.stringify(out));
}

function parseItems(rpcResult) {
  // The MCP `find` tool returns content[0].text as a plain-text block listing
  // items. For v1 we parse the well-known format; richer parsing can move
  // into `search` later.
  const text = rpcResult?.content?.[0]?.text || '';
  const items = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^- \[(\w+)\s+(\d+)%\] (\S+)\s*(.*)$/);
    if (!m) continue;
    items.push({ kind: m[1], score: Number(m[2]) / 100, uri: m[3], abstract: m[4].trim() });
  }
  return items;
}

main().catch(err => { console.error('OV recall failed:', err.message); process.stdout.write('{}'); });
```

- [ ] **Step 3: Implement `session-start.mjs`**

```javascript
// scripts/session-start.mjs
// ZCode SessionStart hook. Probes MCP; if missing, kicks off setup-wizard
// in detached mode (the parent returns immediately so the user is never
// blocked). On resume/compact, fetches a small archive overview.

import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { OvClient, probeOvServer } from './lib/ov-client.mjs';
import { deriveOvSessionId } from './lib/session.mjs';
import { debug } from './lib/debug-log.mjs';
import { detachAndRun } from './lib/async-writer.mjs';

async function readStdin() {
  return new Promise(resolve => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => buf += d);
    process.stdin.on('end', () => resolve(buf));
    process.stdin.resume();
  });
}

async function main() {
  const raw = await readStdin();
  let hookInput = {};
  try { hookInput = JSON.parse(raw); } catch {}
  const sessionId = hookInput.session_id || hookInput.sessionId || process.env.ZCODE_SESSION_ID || `proc-${process.pid}`;
  const ovSession = deriveOvSessionId(sessionId);
  process.env.OPENVIKING_OV_SESSION_ID = ovSession;

  const entry = await discoverOpenVikingMcp();
  const url = entry?.url || process.env.OPENVIKING_URL || 'http://127.0.0.1:1933/mcp';
  const probe = await probeOvServer(url);
  if (!probe.ok) {
    if (!entry) {
      // No MCP entry — try the wizard in detached mode.
      try {
        await detachAndRun({ scriptPath: 'setup-wizard.mjs', payload: {} });
      } catch { /* */ }
    }
    await debug('session:no-server', { url });
    process.stdout.write(JSON.stringify({ continue: true, hookSpecificOutput: { additionalContext: 'OV: no working server — setup wizard running in background. Run `/ov status` to check.' } }));
    return;
  }

  const cfg = resolveConfig({ mcpDiscovered: entry });
  const client = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: cfg.timeoutMs, sessionId: probe.sessionId });
  try {
    await client.initialize();
    await debug('session:ok', { url: cfg.url, ovSession });
  } catch (err) {
    await debug('session:init-fail', { message: err.message });
  }
  process.stdout.write(JSON.stringify({ continue: true }));
}

main().catch(err => { console.error('OV session-start failed:', err.message); process.stdout.write(JSON.stringify({ continue: true })); });
```

- [ ] **Step 4: Manually verify auto-recall against the live server**

Run (sends a real prompt through `auto-recall.mjs`):

```bash
cd "C:/Users/OMID/Code/openviking-memory"
echo '{"prompt":"OpenViking MCP integration"}' | OPENVIKING_MEMORY_ENABLED=1 node scripts/auto-recall.mjs
```

Expected: stdout contains `"additionalContext": "<openviking-context>..."`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/OMID/Code/openviking-memory"
git add scripts/setup-wizard.mjs scripts/auto-recall.mjs scripts/session-start.mjs
git commit -m "feat: setup wizard + auto-recall + session-start hooks"
```

---

## Task 10: `auto-capture.mjs` + `pre-compact.mjs` + `session-end.mjs`

**Files:**
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/auto-capture.mjs`
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/pre-compact.mjs`
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/session-end.mjs`

- [ ] **Step 1: Implement `auto-capture.mjs`**

```javascript
// scripts/auto-capture.mjs
// ZCode Stop hook. Parses transcript → strips pollution → filters turns
// → batch-sends to OV `remember` (async-detached so user never waits).

import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { turnsToMessages, shouldCapture } from './lib/capture.mjs';
import { detachAndRun, approve } from './lib/async-writer.mjs';
import { debug } from './lib/debug-log.mjs';

async function readStdin() {
  return new Promise(resolve => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => buf += d);
    process.stdin.on('end', () => resolve(buf));
    process.stdin.resume();
  });
}

async function main() {
  const raw = await readStdin();
  let hookInput = {};
  try { hookInput = JSON.parse(raw); } catch {}
  const cfg = resolveConfig({ mcpDiscovered: await discoverOpenVikingMcp() });
  if (process.env.OPENVIKING_MEMORY_ENABLED === '0') { approve(); return; }
  if (cfg.captureMode === 'off') { approve(); return; }

  const turns = Array.isArray(hookInput.transcript) ? hookInput.transcript
              : Array.isArray(hookInput.turns) ? hookInput.turns
              : Array.isArray(hookInput.messages) ? hookInput.messages
              : [];
  const messages = turnsToMessages(turns.filter(t => shouldCapture(t, { minQueryLength: cfg.recallMinQueryLength, captureMode: cfg.captureMode })));
  if (messages.length === 0) { approve(); return; }

  if (cfg.writePathAsync) {
    await detachAndRun({ scriptPath: 'auto-capture.mjs', payload: { messages, detached: true }, env: { OPENVIKING_DETACHED: '1', OPENVIKING_URL: cfg.url, OPENVIKING_API_KEY: cfg.apiKey || '', OPENVIKING_ACCOUNT: cfg.account || '', OPENVIKING_USER: cfg.user || '' } });
    approve();
    return;
  }

  // Synchronous path (used when writePathAsync=false, e.g. for debugging)
  const { OvClient } = await import('./lib/ov-client.mjs');
  const client = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: cfg.captureTimeoutMs });
  await client.initialize();
  await client.remember(messages);
  approve();
}

// When invoked in detached mode, run a single remember then exit.
if (process.env.OPENVIKING_DETACHED === '1') {
  (async () => {
    try {
      const raw = await readStdin();
      const { messages } = JSON.parse(raw);
      const cfg = resolveConfig();
      const { OvClient } = await import('./lib/ov-client.mjs');
      const client = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: cfg.captureTimeoutMs });
      await client.initialize();
      const r = await client.remember(messages);
      await debug('capture:detached-ok', { count: messages.length, result: r?.structuredContent?.result || r?.content?.[0]?.text });
    } catch (err) {
      await debug('capture:detached-err', { message: err.message });
    }
    process.exit(0);
  })();
} else {
  main().catch(err => { console.error('OV capture failed:', err.message); approve(); });
}
```

- [ ] **Step 2: Implement `pre-compact.mjs`**

```javascript
// scripts/pre-compact.mjs
// ZCode PreCompact hook — synchronous commit of any pending capture
// before the harness mutates the transcript. For v1 we just trigger the
// capture flow synchronously by re-using auto-capture.mjs without async.

import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { turnsToMessages, shouldCapture } from './lib/capture.mjs';
import { OvClient } from './lib/ov-client.mjs';
import { debug } from './lib/debug-log.mjs';
import { approve } from './lib/async-writer.mjs';

async function readStdin() {
  return new Promise(resolve => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => buf += d);
    process.stdin.on('end', () => resolve(buf));
    process.stdin.resume();
  });
}

async function main() {
  const raw = await readStdin();
  let hookInput = {};
  try { hookInput = JSON.parse(raw); } catch {}
  const cfg = resolveConfig({ mcpDiscovered: await discoverOpenVikingMcp() });
  const turns = Array.isArray(hookInput.transcript) ? hookInput.transcript : [];
  const messages = turnsToMessages(turns.filter(t => shouldCapture(t, { minQueryLength: cfg.recallMinQueryLength, captureMode: 'semantic' })));
  if (messages.length === 0) { approve(); return; }
  try {
    const client = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: cfg.captureTimeoutMs });
    await client.initialize();
    await client.remember(messages);
    await debug('precompact:ok', { count: messages.length });
  } catch (err) {
    await debug('precompact:err', { message: err.message });
  }
  approve();
}

main().catch(err => { console.error('OV precompact failed:', err.message); approve(); });
```

- [ ] **Step 3: Implement `session-end.mjs`**

```javascript
// scripts/session-end.mjs
// ZCode SessionEnd hook — final async commit. Re-uses auto-capture.mjs in
// detached mode with whatever transcript we can scrape from the hook input.

import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { turnsToMessages, shouldCapture } from './lib/capture.mjs';
import { detachAndRun, approve } from './lib/async-writer.mjs';

async function readStdin() {
  return new Promise(resolve => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => buf += d);
    process.stdin.on('end', () => resolve(buf));
    process.stdin.resume();
  });
}

async function main() {
  const raw = await readStdin();
  let hookInput = {};
  try { hookInput = JSON.parse(raw); } catch {}
  const cfg = resolveConfig({ mcpDiscovered: await discoverOpenVikingMcp() });
  const turns = Array.isArray(hookInput.transcript) ? hookInput.transcript : [];
  const messages = turnsToMessages(turns.filter(t => shouldCapture(t, { minQueryLength: cfg.recallMinQueryLength, captureMode: 'semantic' })));
  if (messages.length > 0) {
    await detachAndRun({
      scriptPath: 'auto-capture.mjs',
      payload: { messages, detached: true },
      env: {
        OPENVIKING_DETACHED: '1',
        OPENVIKING_URL: cfg.url,
        OPENVIKING_API_KEY: cfg.apiKey || '',
        OPENVIKING_ACCOUNT: cfg.account || '',
        OPENVIKING_USER: cfg.user || '',
      },
    });
  }
  approve();
}

main().catch(err => { console.error('OV session-end failed:', err.message); approve(); });
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/OMID/Code/openviking-memory"
git add scripts/auto-capture.mjs scripts/pre-compact.mjs scripts/session-end.mjs
git commit -m "feat: capture lifecycle hooks (Stop / PreCompact / SessionEnd)"
```

---

## Task 11: `ov.mjs` (dispatcher) + `ov-status.mjs` + commands/manifest

**Files:**
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/ov.mjs`
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/ov-status.mjs`
- Create: `C:/Users/OMID/Code/openviking-memory/commands/ov.md`
- Create: `C:/Users/OMID/Code/openviking-memory/commands/ov-status.md`
- Create: `C:/Users/OMID/Code/openviking-memory/hooks/hooks.json`

- [ ] **Step 1: Implement `ov.mjs` (dispatcher)**

```javascript
// scripts/ov.mjs
// Dispatcher for `/${command} <subcommand> [args]`. Args after the
// subcommand are joined into a single string and forwarded to the
// matching MCP tool with sensible defaults.

import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { OvClient, probeOvServer } from './lib/ov-client.mjs';

async function client() {
  const cfg = resolveConfig({ mcpDiscovered: await discoverOpenVikingMcp() });
  const probe = await probeOvServer(cfg.url);
  if (!probe.ok) throw new Error(`OV server unreachable at ${cfg.url}`);
  const c = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: cfg.timeoutMs, sessionId: probe.sessionId });
  await c.initialize();
  return c;
}

function printResult(r) {
  const text = r?.structuredContent?.result || r?.content?.[0]?.text || JSON.stringify(r, null, 2);
  process.stdout.write(text + '\n');
}

async function main() {
  const [, , sub, ...rest] = process.argv;
  const arg = rest.join(' ').trim();
  if (!sub || sub === 'help') {
    process.stdout.write(help());
    return;
  }
  const c = await client();
  switch (sub) {
    case 'remember':   return printResult(await c.remember([{ role: 'user', content: arg }]));
    case 'recall':     return printResult(await c.recall({ query: arg }));
    case 'find':       return printResult(await c.find({ query: arg, limit: 10 }));
    case 'search':     return printResult(await c.search({ query: arg, limit: 10 }));
    case 'read':       return printResult(await c.read([arg]));
    case 'list':       return printResult(await c.list(arg || 'viking://', true));
    case 'glob':       return printResult(await c.glob(arg));
    case 'grep': {
      const [uri, ...pat] = rest;
      return printResult(await c.grep(uri, pat.length ? pat : [arg]));
    }
    case 'forget':     return printResult(await c.forget(arg, true));
    case 'health':     return printResult(await c.health());
    case 'setup':      return (await import('./setup-wizard.mjs')).main();
    case 'status':     return (await import('./ov-status.mjs')).main();
    default:
      process.stderr.write(`Unknown subcommand: ${sub}\n`);
      process.stdout.write(help());
      process.exit(2);
  }
}

function help() {
  return [
    'ov <subcommand> [args]',
    '',
    'Subcommands:',
    '  remember <text>     store a memory',
    '  recall  <query>     type-quota memory recall',
    '  find    <query>     fast semantic find',
    '  search  <query>     deep semantic search',
    '  read    <uri>       read a viking:// URI',
    '  list    <uri>       list a viking:// directory',
    '  glob    <pattern>   filename glob',
    '  grep    <uri> <re>  regex content search',
    '  forget  <uri>       permanently delete (irreversible)',
    '  health              server liveness',
    '  setup               re-run setup wizard',
    '  status              one-line status',
    '',
  ].join('\n');
}

main().catch(err => { console.error('ov:', err.message); process.exit(1); });
```

- [ ] **Step 2: Implement `ov-status.mjs`**

```javascript
// scripts/ov-status.mjs
// One-line status: connection, last recall / capture counters, pending.
import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { OvClient, probeOvServer } from './lib/ov-client.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

async function readState(name) {
  try { return JSON.parse(await readFile(join(homedir(), '.zcode', 'openviking', 'state', name), 'utf8')); }
  catch { return null; }
}

async function main() {
  const entry = await discoverOpenVikingMcp();
  const url = entry?.url || process.env.OPENVIKING_URL || 'http://127.0.0.1:1933';
  const probe = await probeOvServer(url);
  if (!probe.ok) { process.stdout.write(`OV ✗ offline (${url})\n`); return; }
  const recall = await readState('last-recall.json');
  const capture = await readState('last-capture.json');
  const rParts = [];
  if (recall) rParts.push(`↩ ${recall.count ?? 0} mem (${(recall.topScore ?? 0).toFixed(2)})`);
  if (capture) rParts.push(`✎ ${capture.pending ?? 0}/${capture.threshold ?? 20000}`);
  process.stdout.write(`OV ✓ ${url}${rParts.length ? ' │ ' + rParts.join(' · ') : ''}\n`);
}

main().catch(err => { console.error('ov-status:', err.message); process.exit(1); });
```

- [ ] **Step 3: Create `commands/ov.md`**

```markdown
---
description: OpenViking memory — store, recall, search, manage resources. Run any /ov subcommand.
---
!node ${ZCODE_PLUGIN_ROOT}/scripts/ov.mjs "$ARGUMENTS"
```

- [ ] **Step 4: Create `commands/ov-status.md`**

```markdown
---
description: Show one-line OpenViking memory plugin status (server, last recall, pending capture).
---
!node ${ZCODE_PLUGIN_ROOT}/scripts/ov-status.mjs
```

- [ ] **Step 5: Create `hooks/hooks.json`**

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node ${ZCODE_PLUGIN_ROOT}/scripts/session-start.mjs", "timeout": 120 } ] }
    ],
    "UserPromptSubmit": [
      { "matcher": "", "hooks": [ { "type": "command", "command": "node ${ZCODE_PLUGIN_ROOT}/scripts/auto-recall.mjs", "timeout": 8 } ] }
    ],
    "Stop": [
      { "matcher": "", "hooks": [ { "type": "command", "command": "node ${ZCODE_PLUGIN_ROOT}/scripts/auto-capture.mjs", "timeout": 45 } ] }
    ],
    "PreCompact": [
      { "matcher": "", "hooks": [ { "type": "command", "command": "node ${ZCODE_PLUGIN_ROOT}/scripts/pre-compact.mjs", "timeout": 30 } ] }
    ],
    "SessionEnd": [
      { "matcher": "", "hooks": [ { "type": "command", "command": "node ${ZCODE_PLUGIN_ROOT}/scripts/session-end.mjs", "timeout": 30 } ] }
    ]
  }
}
```

- [ ] **Step 6: Smoke-test the dispatcher against the live server**

Run:
```bash
cd "C:/Users/OMID/Code/openviking-memory"
node scripts/ov.mjs health
node scripts/ov.mjs status
node scripts/ov.mjs find "OpenViking MCP integration"
```

Expected:
- `health` → server response (likely `{"result":"OK..."}` or similar text).
- `status` → `OV ✓ http://127.0.0.1:1933`.
- `find` → 5-item list with `openviking_mcp` ranked top.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/OMID/Code/openviking-memory"
git add scripts/ov.mjs scripts/ov-status.mjs commands/ hooks/
git commit -m "feat: /ov dispatcher + /ov-status + ZCode commands and hooks manifest"
```

---

## Task 12: Skill content (`openviking-usage`)

**Files:**
- Create: `C:/Users/OMID/Code/openviking-memory/skills/openviking-usage/SKILL.md`
- Create: `C:/Users/OMID/Code/openviking-memory/skills/openviking-usage/references/tools.md`
- Create: `C:/Users/OMID/Code/openviking-memory/skills/openviking-usage/references/patterns.md`
- Create: `C:/Users/OMID/Code/openviking-memory/skills/openviking-usage/references/troubleshooting.md`

- [ ] **Step 1: Create `SKILL.md`**

```markdown
---
name: openviking-usage
description: How to use the OpenViking memory MCP server effectively — when to call which tool, the remember→find loop, anti-patterns to avoid, and how to interpret results. Use whenever the user mentions "remember", "recall", "memory", or you see `mcp__openviking__*` tools in the available toolset, even if the user doesn't explicitly say "memory" — long-running projects and cross-session continuity always benefit.
---

# OpenViking usage

OpenViking is a long-term semantic memory server. It exposes 16 tools over MCP for storing and retrieving memories, resources, skills, files, and code. This skill teaches the model how to use them efficiently.

## When to use

Trigger this skill — and prefer OpenViking — whenever:

1. The user says "remember this", "don't forget", "note that", "from now on".
2. The user asks "do I have any notes about X", "what did we discuss last time", "any prior context on Y".
3. You find yourself about to call `mcp__openviking__*` and want to pick the right tool.
4. The user provides a URL, file, or doc that should persist across sessions (`add_resource`).
5. The conversation has accumulated facts that will matter next session.

## The remember → find loop

```
remember([{ role: 'user', content: 'fact' }])    # async; extraction runs in background
# wait ~2-3s for extraction
find({ query: 'the fact', limit: 5 })            # OR search() for deeper intent
# read top result if you need full content
read([uri])
```

`remember` is **asynchronous**: extraction into curated memories runs in the background. If you `find` immediately, you may not see what you wrote. Wait a few seconds, or check the raw session transcript with `read(['viking://user/default/sessions/<session-id>/messages.jsonl'])`.

## Tool selection matrix

| Goal | Tool | Why |
|---|---|---|
| Store a fact / preference / decision | `remember` | Async-extracted into typed memories |
| Find by meaning, fast | `find` | No session context, ranked by score |
| Find by meaning, with intent analysis | `search` | Optional `session_id` for richer ranking |
| Pull from typed buckets (events/entities/prefs) | `recall` | Returns bounded `memory_group` block |
| Read full content of a URI | `read` | Accepts a list for batch |
| List a directory | `list` | `recursive=true` for deep listing |
| Filename glob | `glob` | Pattern-based; cheap |
| Regex content search | `grep` | Use when you know the literal text |
| Ingest a URL / file | `add_resource` | Async; URL returns directly, file returns upload URL |
| Manage auto-refresh subscriptions | `list_watches` / `cancel_watch` | |
| Symbol-level code navigation | `code_search` / `code_outline` / `code_expand` | Scoped to a `viking://` repo |
| Liveness | `health` | |

## Anti-patterns

- **Don't store raw transcripts.** Use `remember` with one focused message, not the whole conversation.
- **Don't read what you just wrote in the same turn.** `remember` is async — assume a 2-3 s lag.
- **Don't use `find` for exact text.** Use `grep` for substring matches; `find` is semantic and may rank poor matches highly.
- **Don't call `forget` without confirmation.** It's irreversible.
- **Don't loop `add_resource` on the same URL.** Check `list_watches` first.
- **Don't ignore score thresholds.** Default `min_score=0.35` is the right default.

## Pollution prevention

If you build on top of OpenViking (e.g. write your own hook layer), strip these blocks before sending turns back to `remember`:

- `<openviking-context>` ... `</openviking-context>`
- `<system-reminder>` ... `</system-reminder>`
- `<relevant-memories>` ... `</relevant-memories>`
- `[Subagent Context]` ... (until next blank line)

Otherwise the next `find` will surface what you already saw, creating a feedback loop.

## References

- `references/tools.md` — full tool catalog with example payloads.
- `references/patterns.md` — common workflows (ingest, watch, project conventions).
- `references/troubleshooting.md` — common errors and fixes.
```

- [ ] **Step 2: Create `references/tools.md`**

```markdown
# OpenViking tool catalog

All 16 tools, in order of likely use. Args shown are the *minimum useful subset*; full schemas come from `tools/list`.

## `remember(messages)` — write

Async extraction. Returns `{result: "Stored N message(s) and committed for memory extraction."}`.

```json
{ "messages": [{ "role": "user", "content": "ZCode integrates OpenViking MCP at http://127.0.0.1:1933/mcp." }] }
```

## `find({ query, limit?, min_score?, target_uri?, level?, context_type? })` — read

Fast semantic retrieval. Returns a plain-text list of items with `[kind %] uri abstract`.

```json
{ "query": "ZCode MCP integration", "limit": 5, "min_score": 0.35 }
```

## `search({ query, limit?, min_score?, session_id?, target_uri?, level?, context_type? })` — read

Same shape as `find` but with optional `session_id` for intent-aware ranking. Use when you want the server to use conversation context.

## `recall({ query, quotas?, max_chars?, min_score?, peer_scope?, other_peer_penalty? })` — read

Type-quota memory recall. Best for cross-session memory retrieval across events / entities / preferences / experiences.

```json
{ "query": "user's coding preferences", "max_chars": 6500, "min_score": 0.1 }
```

## `read({ uris: [...] })` — read

Fetch full content of one or more `viking://` URIs.

```json
{ "uris": ["viking://user/default/memories/entities/tool_system/openviking_mcp.md"] }
```

## `list({ uri, recursive? })` — filesystem

List a directory.

## `glob({ pattern, uri?, node_limit? })` — filesystem

Filename glob.

## `grep({ uri, pattern[], case_insensitive?, node_limit? })` — filesystem

Regex content search. `pattern` is an array for concurrent multi-pattern search.

## `forget({ uri, recursive? })` — destructive

Permanently delete. `recursive=true` for directories. Irreversible.

## `add_resource({ path, description?, watch_interval?, to?, parent?, args? })` — ingest

- Remote URL: pass `path` as `http(s)://`, `git@`, `ssh://`, or `git://`. For sitemaps / RSS / Atom, the WHOLE site ingests as one tree (use `args={"site": true}` for bare-domain full-site).
- Local file: response returns an upload URL — POST the file to it.
- `watch_interval` minutes: auto-refresh. `0` = no watch. `>=1440` recommended.

## `list_watches()` / `cancel_watch({ to_uri })` — manage

Watch management.

## `code_outline({ uri })` / `code_search({ query, uri })` / `code_expand({ uri, symbol })` — code

Symbol-level code navigation. `code_search` scans up to 200 source files; narrow `uri` for deeper coverage.

## `health()` — liveness

Server health.
```

- [ ] **Step 3: Create `references/patterns.md`**

```markdown
# Patterns

## Ingest a doc

```js
// remote URL — returns immediately, extraction is async
add_resource({ path: 'https://example.com/spec.pdf', description: 'project spec', to: 'viking://resources/myproject/spec' })

// local file — returns a temp upload URL; POST the file to it
add_resource({ path: '/tmp/notes.md', description: 'project notes' })
// → POST the file contents to the returned URL
```

## Watch a URL that changes

```js
add_resource({ path: 'https://example.com/changelog', watch_interval: 1440 }) // daily refresh
list_watches()                                                            // see all
cancel_watch({ to_uri: 'viking://resources/example.com/changelog' })      // stop
```

## Pull prior context at the start of a session

```js
search({ query: 'project conventions', limit: 6, min_score: 0.4 })
read([<top-uri>])
```

## Capture a decision

```js
remember([{ role: 'user', content: 'Decision: use Vitest instead of Jest for the ZCode plugin tests because it has native ESM support.' }])
```

## Confirm a recall hit before using it

```js
const r = find({ query: '...', limit: 3 })
// top items have a score like 0.76; anything below your min_score (default 0.35) is noise
const top = parseItems(r)[0]
if (top.score >= 0.6) read([top.uri])
```

## Per-workspace isolation

The MCP server scopes most memories under `viking://user/<workspace-peer>/...`. To recall only the current project:

```js
find({ query: '...', target_uri: 'viking://user/<peer>' })
```

## Subagent isolation

For subagents, give each one its own `session_id` (the harness usually does this). Don't share `session_id` between unrelated tasks.
```

- [ ] **Step 4: Create `references/troubleshooting.md`**

```markdown
# Troubleshooting

## `remember` returned "Stored 1 message(s)" but `find` doesn't show it
Extraction is async. Wait 2-3 s, or `read` the session's raw transcript:
```
read(['viking://user/default/sessions/<session-id>/messages.jsonl'])
```
If extraction is taking longer than 10 s, the server's LLM is slow; check `health`.

## `find` returns only 0-1 items with low scores
- Query too short: try `min_score=0.1` and a longer query.
- Wrong `target_uri`: pass `target_uri: 'viking://'` for global recall.
- Empty memory: nothing stored yet; use `remember` first.

## `add_resource` for a local file returns an upload URL
You're expected to POST the file to that URL — the server ingests automatically. You do NOT call `add_resource` again.

## `forget` says "Not Found"
The URI doesn't exist. Try `list` to confirm. Check spelling of `viking://`.

## 401 / 403 from the server
Auth headers missing or wrong. The plugin reads `OPENVIKING_API_KEY` / `OPENVIKING_ACCOUNT` / `OPENVIKING_USER` env vars or the MCP entry's `headers` block.

## `Connection closed` from the MCP server
- Server down. Restart OV or fix the URL.
- Wrong transport. The plugin uses `http://.../mcp` (HTTP + JSON-RPC + SSE responses). Make sure the URL ends in `/mcp`.

## `toolCount: 0` from ZCode
The MCP entry exists but failed startup. Check `~/.zcode/cli/log/zcode-YYYY-MM-DD.jsonl` for `mcp.server.connect.*` events.
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/OMID/Code/openviking-memory"
git add skills/
git commit -m "feat: openviking-usage skill with references"
```

---

## Task 13: Integration smoke + unit-test pass + README

**Files:**
- Create: `C:/Users/OMID/Code/openviking-memory/scripts/smoke.mjs`
- Modify: `C:/Users/OMID/Code/openviking-memory/README.md`
- Modify: `C:/Users/OMID/Code/openviking-memory/.zcode-plugin/plugin.json`

- [ ] **Step 1: Implement `scripts/smoke.mjs`**

```javascript
// scripts/smoke.mjs
// Live integration smoke against the configured OV server.
// Exits 0 on success, non-zero on failure.
import { resolveConfig } from './lib/config.mjs';
import { discoverOpenVikingMcp } from './lib/mcp-discovery.mjs';
import { OvClient, probeOvServer } from './lib/ov-client.mjs';

const NOTE = `Smoke ${new Date().toISOString()} — ZCode plugin integration test.`;

async function main() {
  const cfg = resolveConfig({ mcpDiscovered: await discoverOpenVikingMcp() });
  const probe = await probeOvServer(cfg.url);
  if (!probe.ok) throw new Error(`OV unreachable at ${cfg.url}`);
  const c = new OvClient({ url: cfg.url, headers: cfg.headers, timeoutMs: cfg.timeoutMs, sessionId: probe.sessionId });
  await c.initialize();
  const tools = await c.listTools();
  console.log(`tools: ${tools.length}`);
  const store = await c.remember([{ role: 'user', content: NOTE }]);
  console.log(`store: ${store?.content?.[0]?.text}`);
  await new Promise(r => setTimeout(r, 3000));
  const find = await c.find({ query: NOTE, limit: 3 });
  console.log(`recall:\n${find?.content?.[0]?.text}`);
  if (!/Found \d+ item/.test(find?.content?.[0]?.text || '')) {
    throw new Error('No items returned from find after remember — async extraction may need more time.');
  }
}

main().catch(err => { console.error('SMOKE FAIL:', err.message); process.exit(1); });
```

- [ ] **Step 2: Run smoke against the live server**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && node scripts/smoke.mjs`
Expected: prints `tools: 16`, `store: Stored 1 message(s)...`, `recall: Found N item(s)...` where N >= 1.

- [ ] **Step 3: Run all unit tests**

Run: `cd "C:/Users/OMID/Code/openviking-memory" && npm test`
Expected: every `*.test.mjs` passes. If any fail, fix them before continuing.

- [ ] **Step 4: Write the final `README.md`**

```markdown
# OpenViking Memory Plugin for ZCode

Long-term semantic memory for ZCode, powered by [OpenViking](https://github.com/volcengine/OpenViking). Auto-recall relevant memories on every prompt, auto-capture important facts from every turn — no MCP tool calls required from the model.

## Install

```bash
# 1. Drop the plugin into the ZCode cache
ln -s "C:/Users/OMID/Code/openviking-memory" \
      ~/.zcode/cli/plugins/cache/openviking-memory/0.1.0

# 2. Enable in ~/.zcode/cli/config.json under plugins.enabledPlugins:
#    "openviking-memory@openviking-memory": true

# 3. Make sure the openviking MCP server is reachable:
curl http://127.0.0.1:1933/mcp   # should 406 (the MCP handshake)

# 4. Restart ZCode
```

## Configure

The plugin auto-discovers any MCP server entry whose name matches `/^openviking(-memory|-mcp)?$/i` in `~/.zcode/cli/config.json` or workspace `.zcode/config.json`. That entry is the source of truth for URL and auth headers.

To point at a remote server, add to your user `~/.zcode/cli/config.json`:

```json
{
  "mcp": {
    "servers": {
      "openviking": {
        "type": "http",
        "url": "https://your-openviking.example.com/mcp",
        "headers": { "Authorization": "Bearer <token>" }
      }
    }
  }
}
```

To re-run the setup wizard any time: `/ov setup`.

## Tuning (env vars)

All `OPENVIKING_*` env vars from the [OpenViking reference plugin](https://github.com/volcengine/OpenViking/blob/main/examples/claude-code-memory-plugin/README.md) are honored verbatim. The most common ones:

| Var | Default | Purpose |
|---|---|---|
| `OPENVIKING_AUTO_RECALL` | `true` | Toggle auto-recall on `UserPromptSubmit` |
| `OPENVIKING_AUTO_CAPTURE` | `true` | Toggle auto-capture on `Stop` |
| `OPENVIKING_RECALL_LIMIT` | `6` | Max memories injected per turn |
| `OPENVIKING_RECALL_TOKEN_BUDGET` | `2000` | Inline content budget |
| `OPENVIKING_SCORE_THRESHOLD` | `0.35` | Min relevance to inject |
| `OPENVIKING_DEBUG` | `false` | Write `~/.zcode/openviking/logs/zcode-hooks.log` |

## Slash commands

- `/ov <subcommand> [args]` — `remember`, `recall`, `find`, `search`, `read`, `list`, `glob`, `grep`, `forget`, `health`, `setup`, `status`.
- `/ov-status` — one-line status.

## Skill

The `openviking-usage` skill auto-triggers and teaches best-practice usage of the 16 MCP tools. Force-load via `/skill openviking-usage`.

## Test

```bash
npm test           # unit tests
node scripts/smoke.mjs   # integration smoke
```

## License

Apache-2.0
```

- [ ] **Step 5: Bump manifest version and add a tag**

Edit `.zcode-plugin/plugin.json`: bump `"version"` from `0.1.0` to `0.1.1` if any change since Task 1; otherwise leave at `0.1.0`.

- [ ] **Step 6: Final commit**

```bash
cd "C:/Users/OMID/Code/openviking-memory"
git add scripts/smoke.mjs README.md .zcode-plugin/plugin.json
git commit -m "test: integration smoke + final README + version bump"
```

---

## Task 14: Install + manual plugin-test

**Files:** none (only runtime actions).

- [ ] **Step 1: Symlink the plugin into the ZCode cache**

Run:
```bash
mkdir -p ~/.zcode/cli/plugins/cache/openviking-memory
ln -s "C:/Users/OMID/Code/openviking-memory" ~/.zcode/cli/plugins/cache/openviking-memory/0.1.0
ls -la ~/.zcode/cli/plugins/cache/openviking-memory/
```

Expected: shows `0.1.0 -> C:/Users/OMID/Code/openviking-memory`.

- [ ] **Step 2: Enable the plugin**

Edit `~/.zcode/cli/config.json` under `plugins.enabledPlugins`:
```json
"openviking-memory@openviking-memory": true
```

- [ ] **Step 3: Restart ZCode**

Open Settings → Plugins. `openviking-memory` should appear with status enabled.

- [ ] **Step 4: Open a new session and run**

```
/ov health
/ov status
/ov remember "ZCode plugin test note: project uses Vitest"
```

Wait 3-5 s, then:
```
/ov find "vitest plugin"
/ov recall "vitest"
```

Expected:
- `health` and `status` succeed.
- `find` and `recall` return the note you just stored.

- [ ] **Step 5: Type a normal prompt about a topic; verify auto-recall fires**

```
What does the openviking memory plugin do?
```

Inspect the model request in the log (`~/.zcode/cli/log/zcode-YYYY-MM-DD.jsonl`) for `mcp-server-call` events or for `<openviking-context>` blocks in the prompt. Expected: prior memories about OpenViking are surfaced.

- [ ] **Step 6: Tag the release**

```bash
cd "C:/Users/OMID/Code/openviking-memory"
git tag -a v0.1.0 -m "OpenViking memory plugin v0.1.0 for ZCode"
```

---

## Self-review (post-write)

**Spec coverage** (every design-doc section maps to a task):

| Spec section | Task(s) |
|---|---|
| Plugin layout | T1, T11 |
| Config resolution | T3, T4 |
| First-time setup wizard | T4, T9 |
| Hooks (SessionStart / UserPromptSubmit / Stop / PreCompact / SessionEnd) | T9, T10 |
| Commands (`/ov`, `/ov-status`) | T11 |
| Session + peer identity | T2 |
| Skill content | T12 |
| Testing | T13, T14 |
| Packaging + rollout | T13, T14 |

No spec section missing a task.

**Placeholder scan**: no TBDs / "implement later" / vague TODOs. Every code step has the actual code. Tuning var names match between `config.mjs` (T3) and `recall.mjs` / `capture.mjs` consumers (T6 / T7 / T9 / T10).

**Type consistency**:
- `OvClient.toolsCall(name, args)` is called with `{ role, content }[]` for `remember`, `{ uris: [...] }` for `read`, etc. — matches the tool schemas from Task 5 / T11.
- `derivePeerId` returns empty string for empty input — `auto-recall.mjs` (T9) only passes `target_uri` when peer is non-empty. ✅
- `deriveOvSessionId` returns `zcode-<hash>` — `session-start.mjs` exports `OPENVIKING_OV_SESSION_ID` env var so other hooks can pick it up. ✅
- Hook output shapes: `auto-recall.mjs` and `session-start.mjs` print JSON with `hookSpecificOutput.additionalContext` + `continue: true`; `auto-capture.mjs` / `pre-compact.mjs` / `session-end.mjs` print `{ continue: true, decision: 'approve' }`. These are intentionally different — recall/session-start augment the prompt, capture/compact/end do not. ✅

**Ambiguity check**:
- "interactive wizard" — T9 specifies TTY prompt via stdin readline.
- "async-detached worker" — T8 + T10 use the same `detachAndRun` helper.
- "best-effort `notifications/initialized`" — T5 OvClient swallows errors. ✅
- "MCP discovery respects workspace overrides" — T4 `discoverOpenVikingMcp` checks workspace first. ✅

No inline fixes needed.