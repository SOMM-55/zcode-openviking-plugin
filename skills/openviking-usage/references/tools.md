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