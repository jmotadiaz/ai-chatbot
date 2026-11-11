# 06 — Epoch runner, bridge and extension wiring (`epoch-runner.ts`, `pruning-bridge.ts`, `extensions/tool-pruning/`)

Status: ready-for-agent
Blocked by: 02, 03, 04, 05, 05b

## Scope

The orchestration layer that makes everything live, per spec D3, D5 (trigger logic), D6 (fail-open), D7 (persistence/branch-awareness/compaction rearm) and D8 (wiring/observability).

1. `src/pruning/epoch-runner.ts` — orchestrator:
   - Reconstruct active branch state from `ctx.sessionManager.getBranch()`, reading **only entries after the latest `type === "compaction"` entry** (memoized by `(sessionId, getLeafId())`). Derive both the active `ToolPruningMaskMap` and `highestConsumedWatermark` (the max `watermark` among `ToolPruningEpochEntry` entries since the last compaction, or `0` if none).
   - On every `context` event: apply persisted masks (pure, < 1 ms), compute `activeTokens` (`calculateContextTokens(lastValidAssistant.usage) - newlyMaskedTokensBeforeLastAssistant + estimateTokens(trailing)`, or full estimate when no valid usage) and `unmaskedPrunableTokens` (from `partitionCoolingWindow`).
   - Monotonic watermark steps (D3): `nextWatermark` is the first `w` in `config.watermarks` (`[0.45, 0.60, 0.75]`) with `w > highestConsumedWatermark`. If none remains (`highestConsumedWatermark >= 0.75`), no epoch runs until Pi compacts. When `activeTokens >= nextWatermark * contextWindow` AND `unmaskedPrunableTokens >= config.minWorthwhilePruneTokens` (`8_000`), trigger an Epoch consuming the highest `w` in `config.watermarks` satisfied by `activeTokens / contextWindow` (this automatically deactivates `w` and all lower watermarks, e.g. triggering at `0.60` deactivates both `0.45` and `0.60`). No resolved model or `contextWindow <= 0` => no epoch.
   - Runs Phase 0 (ticket 04), short-circuit check (`activeTokensAfterPhase0 <= 0.30 * window` or remaining pool `< minJudgeWorthwhileTokens` (4k) => done, no HTTP), then Phase 1 (ticket 05) with concurrency up to 3 batches; fail-open semantics (if user aborted via `ctx.getSignal()`, do not persist anything and do not consume the watermark; on HTTP/timeout/invalid response, apply Phase 0 drops if any and persist the `ToolPruningEpochEntry` with `failedOpen: true` and the consumed `watermark` so the session cannot retry-loop on the same step).
   - Persist `ToolPruningEpochEntry` via `pi.appendEntry("tool-pruning", entry)` with `watermark: number` (schema in spec D7); emit `TraceLogger("worker")` events `tool_pruning.epoch_completed` / `tool_pruning.epoch_failed_open`.
2. `src/pruning/pruning-bridge.ts` — `Symbol.for("codingAgent.toolPruningBridge")` on `globalThis` (pattern: `src/subagent/subagent-bridge.ts`), carrying only (a) the real `getTraceLogger("worker")` sink and (b) optional `ToolPruningConfig` overrides for tests. The worker side (`src/` runtime) publishes; the jiti-loaded extension resolves. No worker imports inside the bridge module.
3. `extensions/tool-pruning/index.ts` — thin shell registering `pi.on("context", ...)` (no `before_agent_start` needed); resolves model credentials through `ctx.model` (`baseUrl`, `contextWindow`) and `ctx.modelRegistry.getApiKeyAndHeaders(ctx.model)`; branch-aware and compaction-aware state reconstruction derived from `ctx.sessionManager.getBranch()` memoized by `(sessionId, getLeafId())` — masks and consumed watermarks left in abandoned branches disappear automatically after a Message Edit, and all watermarks rearm automatically after a `compaction` entry in the branch.
4. Worker-side wiring: publish the bridge at startup; add optional tool-pruning overrides to `WorkerRuntimeConfig` (read via `runtime-overrides` DI, no `process.env`).
5. Unit tests `tests/unit/pruning/epoch-runner.test.ts`: monotonic watermark progression (`0.45 -> 0.60 -> 0.75`), jumping straight to `0.60` deactivates both `0.45` and `0.60` (so dropping from `60%` to `50%` does NOT re-trigger at `54%` on the next turn), Phase 0 short-circuit, fail-open consumes current watermark without retry storms, user abort does not consume watermark, compaction entry in branch rearms all watermarks, branch reconstruction memoization.

## Verify

`pnpm --filter coding-agent test:unit tests/unit/pruning/` and `pnpm --filter coding-agent build:verify` (types must compile).

## Notes

- Verified facts: [codebase-facts.md](../notes/codebase-facts.md) (Pi SDK event names, jiti isolation, auto-discovered extension path, `getApiKeyAndHeaders`).
- Spec sections: D3, D5, D6, D7, D8, parameter table.
- Tickets 02–05b land the modules this wires.
