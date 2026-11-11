# 02 — Pure core: `config.ts` + `mask.ts` (projection & invariants)

Status: ready-for-agent
Blocked by: —

## Scope

New module directory `packages/coding-agent/src/pruning/` — pure, dependency-light, testable in isolation. No extension registration yet (ticket 06 wires it).

Implement exactly what spec D1 and the config summary table define:

1. `src/pruning/config.ts` — `ToolPruningConfig` interface + `DEFAULT_TOOL_PRUNING_CONFIG` with every default from the spec's parameter table (`enabled`, `watermarks: [0.45, 0.60, 0.75]`, `minWorthwhilePruneTokens: 8_000`, `minJudgeWorthwhileTokens: 4_000`, `coolingRecentTokens: 16_000`, `minCoolingToolCalls: 6`, `maxProtectedTurnTokens: 40_000`, `stubHeadChars: 150`, `stubTailChars: 150` (min truncation length 380), `errorTruncateMinChars: 2_000`, `maxDecisionStateTokens: 20_000`, `maxQuestionsPerBatch: 80`, `maxDecisionBatches: 3`, `dropResultThreshold: 0.25`, `dropCallThreshold: 0.15`, `decisionTimeoutMs: 4_000`). Types shared by later tickets (decision kinds `"keep" | "drop_result" | "drop_call"`, mask map types, `ToolPruningEpochEntry` with `watermark: number` per spec D7) live here.
2. `src/pruning/mask.ts` — `applyPruningMask(messages, masks, config)` pure projection:
   - Actions per spec D1: `keep` (nothing persisted/mutated), `drop_result` (keep `ToolCall` block + `ToolResultMessage` envelope `role/toolCallId/toolName/isError/timestamp`, replace `content` with single text block `head(150) + "… [Tool Pruning: omitted <N> chars from <toolName>; re-run or re-read if exact output is needed] …" + tail(150)`; omit image blocks leaving `[<M> image(s) omitted]` in the marker), `drop_call` (remove the `ToolCall` block from the `AssistantMessage` and its `ToolResultMessage`).
   - Never apply `drop_result` to results whose total text is `<= 380` chars and have no images (stub saves nothing).
   - Invariants (test them all): atomic pairing by `toolCallId`; unpaired in-flight calls excluded; multi-tool `AssistantMessage` preserves remaining blocks (`Thinking`, `Text`, other `ToolCall`s) in order; all-`drop_call` handling — keep the message if non-empty `TextContent` remains, omit the whole `AssistantMessage` if only thinking/empty; `UserMessage`, `BashExecutionMessage`, `CustomMessage`, `CompactionSummaryMessage` pass through untouched.
3. Unit tests `tests/unit/pruning/mask.test.ts` covering every invariant in spec Testing Decisions bullet 1.

## Verify

`pnpm --filter coding-agent test:unit tests/unit/pruning/mask.test.ts`

## Notes

- Verified facts: [codebase-facts.md](../notes/codebase-facts.md) § Pi SDK (AgentMessage shapes come from the Pi SDK types — check `node_modules/@earendil-works/pi-coding-agent/dist/core/...` type definitions for `AgentMessage`, `ToolCall`, `ToolResultMessage`, `ThinkingContent` field names).
- Spec sections: D1 (exact stub text, invariants), config summary table.
