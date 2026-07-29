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