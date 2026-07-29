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