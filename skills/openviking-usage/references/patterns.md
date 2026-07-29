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