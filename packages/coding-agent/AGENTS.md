# Agent Instructions — coding-agent

HTTP worker that wraps `@earendil-works/pi-coding-agent`. Manages coding agent sessions, translates Pi events into AG-UI protocol events, and exposes an `/rpc` endpoint.

## Key Files

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Type definitions and public exports |
| `src/session-manager.ts` | Session lifecycle: create, run, reconnect, dispose |
| `src/pi-to-agui-translator.ts` | Pi events → AG-UI protocol events |
| `src/event-log.ts` | In-memory event log with pub/sub for replay |
| `src/replay-compaction.ts` | Merges consecutive streaming deltas (chunks/args) before reconnect replay |
| `src/transports/http.ts` | HTTP server with `/rpc` POST endpoint |
| `src/pi-packages.ts` | Pi packages the worker loads (checkout dir, pinned refs) |
| `scripts/install-packages.ts` | Clones/updates those packages before the worker starts |

## Pi Packages

The worker loads Pi packages through the SDK, not through the `pi` CLI. `scripts/install-packages.ts` clones each entry of `PI_PACKAGES` into `.pi/packages/<name>` at the pinned ref, and `session-manager.ts` passes those paths as `resourceLoaderOptions.additionalExtensionPaths` — the programmatic equivalent of `pi -e <source>`. `pi install` is deliberately not used: it writes to the machine-wide `~/.pi/agent/settings.json` and would change every `pi` run outside this repo, the same reason `models.json` is project-scoped.

Currently installed: [superpowers](https://github.com/obra/superpowers) (skills for brainstorming, planning, TDD and systematic debugging, plus an extension that injects the `using-superpowers` bootstrap at session start and after compaction).

| Env var | Default | Purpose |
| --- | --- | --- |
| `CODING_AGENT_PI_PACKAGES_DIR` | `.pi/packages` | Checkout directory (relative values resolve against `packages/coding-agent`) |
| `CODING_AGENT_SUPERPOWERS_REF` | `v6.2.0` | Git ref for superpowers |

The install step is idempotent and skips the network when the checkout already matches the pinned ref, so it runs on every `transport:http` start. It never fails the worker: if the clone or fetch fails, the worker starts with whatever is on disk (possibly nothing). Run `pnpm --filter coding-agent packages:install --force` to re-fetch a moving ref.
