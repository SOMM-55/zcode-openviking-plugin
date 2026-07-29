---
description: OpenViking memory — store, recall, search, manage resources. Run any /ov subcommand.
argument-hint: "<subcommand> [args]"
---

Use the `openviking-usage` skill to handle this OpenViking request.

The user invoked `/ov` with these arguments: $ARGUMENTS

Subcommands:
- `remember <text>` — store a memory
- `recall <query>` — type-quota memory recall
- `find <query>` — fast semantic find
- `search <query>` — deep semantic search
- `read <uri>` — read a viking:// URI
- `list <uri>` — list a viking:// directory
- `glob <pattern>` — filename glob
- `grep <uri> <re>` — regex content search
- `forget <uri>` — permanently delete (irreversible)
- `health` — server liveness
- `setup` — re-run setup wizard
- `status` — one-line status

Map the arguments to the right MCP tool call. Don't run a shell command — call the MCP tools directly. The OpenViking server is already connected as `mcp__openviking__*` in this session.