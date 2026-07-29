# Contributing

Thanks for your interest in improving OpenViking Memory for ZCode!

## Bug reports

Open an issue with:

- ZCode version (`Settings → About`)
- Plugin version (`Settings → Plugin Management → openviking-memory → detail`)
- OpenViking server version (`curl http://127.0.0.1:1933/health`)
- Relevant log lines from `~/.zcode/v2/logs/$(date +%Y-%m-%d).log`
- Reproduction steps

## Development setup

1. Clone the repo
2. Make sure an OpenViking server is running locally (`http://127.0.0.1:1933`)
3. Install the plugin as a local directory in ZCode:
   - **Settings → Plugin Management → Discover → `+` → Local directory → `<repo>`**
4. Run tests:

```bash
npm test
node scripts/smoke.mjs
```

## Pull requests

- Keep changes focused — one feature/fix per PR
- Add tests for any new logic
- Run `npm test` before committing
- Update `CHANGELOG.md` under "Unreleased"
- Follow the existing code style (plain `node:fs/promises`, ESM `.mjs`, no bundler)

## Project structure

The plugin is pure Node.js with no runtime dependencies. The split is:

- `scripts/lib/` — pure functions, individually tested
- `scripts/*.mjs` — hook scripts (one per ZCode event)
- `scripts/ov.mjs` — slash command dispatcher
- `skills/` — markdown loaded into the model
- `commands/` — slash command definitions
- `hooks/hooks.json` — registered hook events

## Testing philosophy

- Unit tests live next to the code (`scripts/lib/*.test.mjs`)
- Use `node:test` (built-in) — no Jest, no Mocha
- Each test should be self-contained and not require a live server
- `scripts/smoke.mjs` is the only place that requires a running OpenViking server

## Versioning

We follow [SemVer](https://semver.org/). Bump:

- **Patch** — bug fixes, no behavior change
- **Minor** — new features, backward-compatible
- **Major** — breaking changes (config schema, hook output, command syntax)

## License

By contributing, you agree that your contributions will be licensed under Apache-2.0.
