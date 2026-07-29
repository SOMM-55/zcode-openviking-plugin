# OpenViking Memory Plugin for ZCode — Design

**Status**: draft (awaiting user review)
**Date**: 2026-07-29
**Author**: brainstormed with user
**Goal**: ship a ZCode plugin that gives ZCode agents long-term semantic memory via OpenViking, faithful to the existing `claude-code-memory-plugin` but adapted to ZCode's plugin format and discovery flow.

## Problem

ZCode has no first-class long-term memory. The `openviking` MCP server is now connected, but:

- Memories are only stored when the user explicitly asks the model to call `mcp__openviking__remember`.
- There's no auto-recall: the model never sees past memories unless it happens to call `find`/`recall` on its own.
- There's no auto-capture: valuable facts from a session evaporate when the session ends.
- No best-practice skill: the model has to discover 16 tools by trial and error.

The reference `claude-code-memory-plugin` solves all of this for Claude Code. The goal is to bring the same capability to ZCode in a way that respects ZCode's plugin format, hook events, and config discovery.

## Approach: C — Hybrid (MCP discovery + direct HTTP)

Hooks call OpenViking directly over HTTP (faithful to the reference, gives us a stable async-detached worker pattern), but config discovery reads the existing MCP server entry from `~/.zcode/cli/config.json` so the plugin and the MCP tools share **one source of truth** for URL and auth. If no MCP entry exists, an interactive setup wizard creates one.

Rejected alternatives:

- **A — Direct HTTP, faithful port**: same shape as reference, but config lives in its own file independent of MCP. We'd have two places to update when the server moves. Worse UX for the "config may change" requirement.
- **B — MCP-only (hooks call `mcp__*` tools)**: ZCode hooks run as standalone Node processes; they do not have access to the model's MCP tool registry. Would require writing an MCP client anyway. Rejected.

## Plugin layout

```
openviking-memory/
├── .zcode-plugin/
│   └── plugin.json                 # manifest
├── skills/
│   └── openviking-usage/
│       ├── SKILL.md                # when + how to use OV
│       └── references/
│           ├── tools.md            # full tool catalog with examples
│           ├── patterns.md         # remember→find, ingestion, watches
│           └── troubleshooting.md
├── commands/
│   ├── ov.md                       # /ov <subcommand>
│   └── ov-status.md                # /ov-status (alias)
├── hooks/
│   └── hooks.json                  # ZCode hook registrations
├── scripts/
│   ├── lib/
│   │   ├── config.mjs              # env > MCP discovery > file > defaults
│   │   ├── mcp-discovery.mjs       # reads ~/.zcode/cli/config.json
│   │   ├── ov-client.mjs           # HTTP + JSON-RPC client
│   │   ├── session.mjs             # OV session-id, peer-id derivation
│   │   ├── recall.mjs              # search→rank→token-budget→format
│   │   ├── capture.mjs             # transcript parse, pollution strip, batch send
│   │   ├── async-writer.mjs        # detached worker
│   │   └── debug-log.mjs
│   ├── setup-wizard.mjs            # interactive first-time setup
│   ├── ov.mjs                      # /ov dispatcher
│   ├── ov-status.mjs               # one-line status renderer
│   ├── session-start.mjs
│   ├── auto-recall.mjs
│   ├── auto-capture.mjs
│   ├── session-end.mjs
│   └── pre-compact.mjs
├── README.md
└── package.json                    # type:module marker, no runtime deps
```

## Config resolution

Resolution order (highest → lowest priority) when a hook or command needs the OpenViking URL/token:

1. **Process env vars** (`OPENVIKING_URL`, `OPENVIKING_API_KEY`, `OPENVIKING_ACCOUNT`, `OPENVIKING_USER`, plus the `OPENVIKING_*` tuning vars from the reference).
2. **MCP discovery**: read `~/.zcode/cli/config.json` (and active workspace `<repo>/.zcode/config.json` if present) for an MCP server whose key matches `/^openviking(-memory|-mcp)?$/i`. Use its `url` and `headers` (Bearer / X-OpenViking-*) verbatim.
3. **`~/.zcode/openviking/config.json`** — connection fields + tuning vars.
4. **Built-in defaults**: `http://127.0.0.1:1933`, no auth, peer derived from cwd.

Tuning vars (recall budget, capture mode, write-path async, etc.) match the reference README one-for-one. We do not add new ones unless we hit a gap.

**No secrets in `url`**: if the wizard needs to write a token, it goes into `mcp.servers.<name>.headers.Authorization` only. This is a hard rule.

## First-time setup flow

Triggered when `SessionStart` finds no working OV server:

1. Probe `127.0.0.1:1933/mcp` — if `tools/list` succeeds, record it as the default and exit.
2. Else scan all `openviking*`-named MCP entries in `~/.zcode/cli/config.json`; use the first reachable one.
3. Else prompt the user (interactive TTY) for URL, API key, account, user. The wizard then writes:
   - The MCP server entry into `~/.zcode/cli/config.json` under `mcp.servers.openviking` (canonical schema, secrets in `headers`, `timeoutMs: 60000`).
   - A mirror at `~/.zcode/openviking/config.json` for tuning vars and as a backup.
4. Else non-interactive fallback: SessionStart hook approves immediately, logs a single-line `OV: not configured — run /ov setup` warning. All other hooks early-return.

## Hooks

| ZCode event | Script | Timeout | What it does |
|---|---|---|---|
| `SessionStart` | `session-start.mjs` | 120 s | Probe MCP server; trigger setup wizard if missing (non-blocking); on resume, fetch archive overview. |
| `UserPromptSubmit` | `auto-recall.mjs` | 8 s | `find` against prompt → rank → trim to token budget → inject `<openviking-context>`. |
| `Stop` | `auto-capture.mjs` | 45 s | Parse transcript → strip pollution blocks → batch-send new turns to OV session → commit when threshold crossed. Async-detached worker so the user never waits. |
| `PreCompact` | `pre-compact.mjs` | 30 s | Synchronous commit before harness mutates transcript. |
| `SessionEnd` | `session-end.mjs` | 30 s | Final commit. Async-detached. |

Subagent hooks (`SubagentStart`/`SubagentStop`) are **deferred to v2** to keep v1 small.

## Commands

- **`/ov <subcommand> [args]`** (`scripts/ov.mjs`) — subcommands:
  - `remember <text>` → `remember`.
  - `recall <query>` → `recall` (memory_group block).
  - `find <query>` / `search <query>` → passthrough.
  - `read <uri>` / `list <uri>` / `glob <pattern>` / `grep <uri> <pattern>` → filesystem.
  - `forget <uri>` → `forget`; requires explicit `yes` confirmation via `AskUserQuestion`.
  - `add-resource <path-or-url>` → `add_resource`; prints temp upload URL for local files.
  - `watches` / `cancel-watch <uri>` → manage watches.
  - `health` → liveness.
  - `setup` → re-run the wizard.
  - `status` → one-line status (alias of `/ov-status`).
- **`/ov-status`** — fast status check, single command file.

## Session and peer identity

- **OV session id**: derived from `${ZCODE_SESSION_ID}` (or per-process uuid if absent). One OV session per ZCode session.
- **Peer id**: workspace-derived per repo using the reference naming rule (every non-alphanumeric → `-`). Cached per cwd in `~/.zcode/openviking/state/peer-cache.json`. Honors `OPENVIKING_PEER_ID` override and `OPENVIKING_WORKSPACE_PEER=0` to disable.

## Skill content (`openviking-usage`)

`SKILL.md` body (target ~300 lines):

- **When to use** — 5 trigger conditions with examples.
- **The remember→find loop** — concrete recipe.
- **Tool selection matrix** — `remember` vs `find` vs `search` vs `recall` vs `read`.
- **Anti-patterns** — don't store raw transcripts, don't read what you just wrote (extraction is async), use `grep` for exact text.
- **Pollution prevention** — strip `<openviking-context>`, `<system-reminder>`, `<relevant-memories>` blocks before capture.
- **References**: `tools.md`, `patterns.md`, `troubleshooting.md`.

Skill triggers automatically via description; force-loadable via `/skill openviking-usage`.

## Testing

1. **Unit tests** (`scripts/lib/*.test.mjs`, `node --test`):
   - `config.mjs` — env vs file vs default precedence.
   - `session.mjs` — peer + OV-session-id derivation.
   - `recall.mjs` — ranking + token-budget trimming (synthetic fixtures).
   - `capture.mjs` — pollution-strip regexes, batch-send grouping.
   - `mcp-discovery.mjs` — name-pattern matching, ignores other MCP servers.
2. **Integration smoke** (`scripts/smoke.mjs`, live OV):
   - initialize → list tools → `remember` → wait 3 s → `find` → assert round-trip.
3. **Manual plugin-test plan** in `README.md` (drop folder into cache, enable, run `/ov health` then `/ov remember` then `/ov recall`).

## Packaging and rollout

- Lives at `C:\Users\OMID\Code\openviking-memory\`.
- Install = copy/symlink into `~/.zcode/cli/plugins/cache/<marketplace>/openviking-memory/<version>/` and add `"openviking-memory@<marketplace>": true` to `enabledPlugins`.
- **No build step, no runtime npm deps** — same as reference. `package.json` declares `"type": "module"` and `"test": "node --test scripts/lib/*.test.mjs"`.
- Cross-platform: pure Node + Markdown; no shell-specific code in scripts; uses `os.homedir()` and `path.join`. Verified to work on Windows + macOS + Ubuntu by virtue of using only Node stdlib.

**Rollout order** (also defines the implementation plan order):

1. Plugin skeleton + manifest + empty skill → verify ZCode picks it up.
2. `config.mjs` + `mcp-discovery.mjs` + `setup-wizard.mjs` → test against existing MCP entry.
3. `recall.mjs` + `auto-recall.mjs` + `session-start.mjs` → verify `<openviking-context>` injection on a real prompt.
4. `capture.mjs` + `auto-capture.mjs` + `pre-compact.mjs` + `session-end.mjs` → verify memory appears after a real turn.
5. `/ov` dispatcher + `/ov-status`.
6. Skill content (`openviking-usage` SKILL.md + references).
7. Smoke + unit tests.
8. Final install + README.

## Non-goals (v1)

- Subagent hooks (`SubagentStart`/`SubagentStop`) — defer to v2.
- Statusline integration — defer to v2.
- `claude_code.*` legacy config block — not relevant; reference uses it for back-compat.
- Marketplace packaging (`.zcode-plugin-seed.json` distribution via `git-subdir` from a public repo) — defer until v1 is stable.

## Open questions for the user (before plan)

None — all design sections approved during brainstorming.