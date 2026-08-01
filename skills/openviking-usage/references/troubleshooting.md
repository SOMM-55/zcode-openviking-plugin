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