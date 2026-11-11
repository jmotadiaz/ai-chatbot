# 05b — Align `config.ts`, `cooling-window.ts` and `decision-state.ts` with monotonic watermarks

Status: ready-for-agent
Blocked by: 02, 03, 04, 05

## Scope

Tickets 02 and 03 were merged onto `feat/tool-pruning` and tickets 04 (`tp/pruning-supersession`) and 05 (`tp/pruning-decision`) were implemented in worktrees before the spec was simplified to **monotonic stepped watermarks (`watermarks: [0.45, 0.60, 0.75]`)** with a unified Cooling Window and a single-band decision policy (see updated [spec.md](../spec.md) D3, D4, D5, D7 and parameter table).

This ticket merges the completed work from `tp/pruning-supersession` (04) and `tp/pruning-decision` (05) and refactors `config.ts`, `cooling-window.ts` and `decision-state.ts` (plus their unit tests) to match the updated spec before starting ticket 06 (`epoch-runner.ts`).

## Requirements

1. **Merge completed worktree branches into `feat/tool-pruning`** (and remove obsolete worktrees if appropriate):
   - Merge `tp/pruning-supersession` (ticket 04: `supersession.ts` + `supersession.test.ts`).
   - Merge `tp/pruning-decision` (ticket 05: `decision-state.ts`, `systemone-client.ts` + tests).
2. **`src/pruning/config.ts`**:
   - Replace `softWatermarkRatio`, `hardWatermarkRatio`, `minPrunableDeltaTokens`, `epochCooldownTokens`, `emergencyUpperBand`, `emergencyTargetRatio` with `watermarks: readonly number[]` (default `Object.freeze([0.45, 0.6, 0.75])`).
   - Remove `ToolPruningTrigger` (`"turn_watermark" | "intra_turn_emergency"`).
   - Update `ToolPruningEpochEntry` to carry `watermark: number` instead of `trigger: ToolPruningTrigger`.
3. **`src/pruning/cooling-window.ts` + `tests/unit/pruning/cooling-window.test.ts`**:
   - Remove `trigger` from `CoolingWindowOptions` and `CoolingWindowPartition` (`options?: CoolingWindowOptions` can now be optional with `{ config?, masks? }`).
   - Unify the protected window per spec D4: union of (a) the recent tail (`coolingRecentTokens = 16_000` tokens **and** `minCoolingToolCalls = 6` paired calls), (b) the active Turn (since the last `UserMessage`) capped at `maxProtectedTurnTokens` (`40_000` tokens; if the active Turn exceeds `40_000` tokens, protect its most recent `20_000` tokens so a marathon single Turn or Subagent can still prune its first half), and (c) the most recent completed Turn that used at least one tool (skipping prose-only turns in between), also capped at `maxProtectedTurnTokens` (`20_000` if exceeded).
   - Update `tests/unit/pruning/cooling-window.test.ts` accordingly.
4. **`src/pruning/decision-state.ts` + `tests/unit/pruning/decision-state.test.ts`**:
   - Remove `DecisionPolicyMode` (`"normal" | "emergency"`), `EMERGENCY_EXTEND_TRIGGER_RATIO`, `emergencyDrops` and the `[0.25, 0.40)` `keepResult / log2(tokensEst)` emergency extension from `applyDecisionPolicy` (`DecisionPolicyOptions` only needs `{ activeTokens, config? }` or `{ config? }`).
   - Keep the single asymmetric conservative policy across all watermark steps: `keepResult >= config.dropResultThreshold` (`0.25`) => `keep`; `keepResult < 0.25` => `drop_call` when `eligibility.dropCall && keepCall < config.dropCallThreshold` (`0.15`), else `drop_result` when `eligibility.dropResult`.
   - Update `tests/unit/pruning/decision-state.test.ts` and `tests/unit/pruning/mask.test.ts` if any config fixture references the removed fields.

## Verify

`pnpm --filter coding-agent test:unit tests/unit/pruning/`
