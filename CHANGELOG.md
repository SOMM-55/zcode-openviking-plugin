# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Reverted to flat wrapper layout** — the nested `plugins/openviking-memory/` layout introduced in v0.1.0 made the plugin install without any hooks, skills, or commands being registered. ZCode's `directory` source loader copies the wrapper root verbatim into `cache/<marketplace>/<plugin>/<version>/` and looks for `.zcode-plugin/plugin.json` directly there — it does not resolve `marketplace.json`'s `source.path` field for nested subdirectories. All plugin files now live at the repo root next to `marketplace.json`. `marketplace.json` `source.path` is now `"."`. The plugin code itself is unchanged.

## [0.1.0] - 2026-07-29

### Added
- Initial release — ZCode port of the OpenViking Claude Code memory plugin
- **Auto-recall** hook on `UserPromptSubmit` — injects `<openviking-context>` blocks before each prompt
- **Auto-capture** hook on `Stop` / `SessionEnd` / `PreCompact` — async-detached writes so the user never waits
- **uri-guard** hook on `PreToolUse(Read|Glob|Grep)` — redirects `viking://...` reads to MCP tools
- **Session-start** hook — probes MCP, triggers setup wizard if missing
- **Slash commands**:
  - `/ov <subcommand>` — `remember`, `recall`, `find`, `search`, `read`, `list`, `glob`, `grep`, `forget`, `health`, `setup`, `status`
  - `/ov-status` — one-line status
- **Skill** `openviking-usage` with 3 reference docs (tools, patterns, troubleshooting)
- **8 lib modules** with 29 unit tests:
  - `config.mjs` — env > MCP discovery > file > defaults precedence
  - `mcp-discovery.mjs` — reads `~/.zcode/cli/config.json` for openviking MCP entry
  - `ov-client.mjs` — thin MCP-over-HTTP client with `probeOvServer`
  - `session.mjs` — peer & OV-session-id derivation
  - `recall.mjs` — ranking + token-budget + context formatter
  - `capture.mjs` — pollution strip + turn filtering
  - `async-writer.mjs` — detached worker for `Stop`/`SessionEnd`
  - `debug-log.mjs` — gated by `OPENVIKING_DEBUG`
- **Setup wizard** (`setup-wizard.mjs`) — interactive first-time setup
- **Smoke test** (`scripts/smoke.mjs`) — live integration check against the OV server
- **Plugin icon** — custom SVG (`assets/logo.svg`)

### Notes
- ZCode supports 7 hook events. `SubagentStart`/`SubagentStop`/`PostToolUse(Read)` from the upstream Claude Code plugin are not supported in ZCode and were omitted.
- `PreCompact` is registered but ZCode does not fire it on all builds; `SessionEnd` is the reliable final-commit hook.
