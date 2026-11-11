# 03 — Cooling Window + candidate pool + tool policy (`cooling-window.ts`)

Status: ready-for-agent
Blocked by: 02

## Scope

`packages/coding-agent/src/pruning/cooling-window.ts` — pure partition + eligibility per spec D2 and D4.

1. Partition the (already-masked) `AgentMessage[]` into **Cooling Window** (protected tail) and **Living Candidate Pool**:
   - Walk messages from the end backwards; protected = union of: (a) at least the last `coolingRecentTokens` tokens of masked context **and** the last `minCoolingToolCalls` paired tool calls, (b) the current Turn since its last `UserMessage` and the last completed Turn containing at least one tool call (skipping prose-only turns in between), each capped at `maxProtectedTurnTokens` (if a single Turn exceeds the cap, protect only its most recent `20_000` tokens — the excess prefix becomes evaluable so a marathon single Turn or Subagent can still prune its first half).
   - Export a token estimator for message spans (use Pi's `estimateTokens` if importable from the SDK without worker imports, otherwise a chars/4 estimator — state the choice in a comment).
2. Eligibility per D2 (default-deny): `read/grep/find/ls` => keep/drop_result/drop_call; `bash` => keep/drop_result (never drop_call); `edit/write/subagent/publish_artifact` and any unknown tool => always keep.
3. Error Gate: `isError === true` => never `drop_call`; errors `<= 2_000` chars => forced keep; errors `> 2_000` chars => `drop_result` only, and only for calls outside the Cooling Window that pass Phase 0 supersession or a judge drop (the partition just marks them eligible-conditional; enforcement lands in tickets 04/05/06).
4. Unit tests: `tests/unit/pruning/cooling-window.test.ts` (the Explore→Converse→Edit three-turn case, single giant Turn > 40k tokens — both completed and active/subagent) and `tests/unit/pruning/policy.test.ts` (tool categories, Error Gate sizes, unknown tools).

## Verify

`pnpm --filter coding-agent test:unit tests/unit/pruning/cooling-window.test.ts tests/unit/pruning/policy.test.ts`

## Notes

- Spec sections: D2, D4 (incl. the "why" for the composed rule).
- Depends on ticket 02 types (`config.ts`).
