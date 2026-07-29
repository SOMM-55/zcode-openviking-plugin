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