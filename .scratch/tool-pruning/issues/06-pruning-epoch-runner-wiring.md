# 06 — Epoch runner, bridge and extension wiring (`epoch-runner.ts`, `pruning-bridge.ts`, `extensions/tool-pruning/`)

Status: ready-for-agent
Blocked by: 02, 03, 04, 05

## Scope

The orchestration layer that makes everything live, per spec D3, D5 (trigger logic), D6 (fail-open), D7 (persistence/branch-awareness) and D8 (wiring/observability).

1. `src/pruning/epoch-runner.ts` — orchestrator:
   - On every `context` event: apply persisted masks (pure, < 1 ms), compute `activeTokens` (`calculateContextTokens(lastValidAssistant.usage) + estimateTokens(trailing)`, or full estimate when no valid usage) and `unmaskedPrunableTokens`.
   - Triggers (D3): turn watermark armed in `before_agent_start`, checked only on the first `context` call of the Turn (`activeTokens >= 0.45*window` OR `unmaskedPrunableTokens >= 30k`, AND `unmaskedPrunableTokens >= 8k`); emergency watermark on subsequent `context` calls (`activeTokens >= 0.75*window` AND ≥ 8k). No resolved model/contextWindow => no epoch. No model => no trigger.
   - Cooldown: after an epoch that freed < 4k tokens or failed open, no new epoch until `unmaskedPrunableTokens` grows ≥ 15k more (unless crossing the 75% emergency watermark for the first time).
   - Runs Phase 0 (ticket 04), short-circuit check (`<= 0.30*window` or pool < 4k => done, no HTTP), then Phase 1 (ticket 05) with concurrency up to 3 batches; emergency band extension; fail-open semantics (Phase 0 drops persist if ≥ 4k; otherwise nothing); aborts via `ctx.getSignal()`.
   - Persist `ToolPruningEpochEntry` via `pi.appendEntry("tool-pruning", entry)` on effective epochs (schema in spec D7); emit `TraceLogger("worker")` events `tool_pruning.epoch_completed` / `tool_pruning.epoch_failed_open`.
2. `src/pruning/pruning-bridge.ts` — `Symbol.for("codingAgent.toolPruningBridge")` on `globalThis` (pattern: `src/subagent/subagent-bridge.ts`), carrying only (a) the real `getTraceLogger("worker")` sink and (b) optional `ToolPruningConfig` overrides for tests. The worker side (`src/` runtime) publishes; the jiti-loaded extension resolves. No worker imports inside the bridge module.
3. `extensions/tool-pruning/index.ts` — thin shell registering the hooks (`context`, `before_agent_start`, `session_compact` no-op hook if needed); resolves model credentials through `ctx.model` (`baseUrl`, `contextWindow`) and `ctx.modelRegistry.getApiKeyAndHeaders(ctx.model)`; branch-aware mask reconstruction derived from `ctx.sessionManager.getBranch()` memoized by `(sessionId, getLeafId())` — masks from entries left in abandoned branches disappear automatically after a Message Edit.
4. Worker-side wiring: publish the bridge at startup; add optional tool-pruning overrides to `WorkerRuntimeConfig` (read via `runtime-overrides` DI, no `process.env`).
5. Unit tests `tests/unit/pruning/epoch-runner.test.ts`: trigger arming/first-context-only, cooldown after low-yield/fail-open, fail-open persistence rules, entry schema, branch reconstruction memoization.

## Verify

`pnpm --filter coding-agent test:unit tests/unit/pruning/` and `pnpm --filter coding-agent build:verify` (types must compile).

## Notes

- Verified facts: [codebase-facts.md](../notes/codebase-facts.md) (Pi SDK event names, jiti isolation, auto-discovered extension path, `getApiKeyAndHeaders`).
- Spec sections: D3, D5 (trigger numbers), D6, D7, D8, parameter table.
- Tickets 02–05 land the modules this wires.
