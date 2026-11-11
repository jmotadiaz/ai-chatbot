# 04 — Phase 0 deterministic supersession (`supersession.ts`)

Status: ready-for-agent
Blocked by: 03

## Scope

`packages/coding-agent/src/pruning/supersession.ts` — the $0 ms network-free pass per spec D5 Phase 0.

1. Automatic `read` supersession (no judge): normalize paths relative to a passed `cwd`; full `read(path)` (no offset/limit, `isError: false`) auto-dropped when a later successful `read(path)` full or `write(path)` on the same path exists — `drop_call` if no `edit/write` in between, `drop_result` otherwise; ranged `read(path, offset, limit)` => `drop_result` when a later full `read` covers the range (`[o2, o2+l2] ⊇ [o1, o1+l1]`) or a later successful `write(path)` exists; `isError: true` reads > 2_000 chars => `drop_result` if a later successful `read`/`write` on the same path exists.
2. Structural signals for Phase 1 on surviving candidates: `editedLater`, `sameCommandRanLater`, `laterCommandSucceeded` (normalized bash command re-run later).
3. Evidence may come from Cooling Window calls, but only candidates outside it are mutated.
4. Short-circuit: after Phase 0 drops, report remaining pool tokens; the runner (ticket 06) skips Phase 1 when `activeTokens <= 0.30 * contextWindow` or pool < `minJudgeWorthwhileTokens` (expose the numbers; the decision lives in `epoch-runner`).
5. Unit tests `tests/unit/pruning/supersession.test.ts`: full-read superseded by later read/write, ranged covered vs partial, `drop_call` vs `drop_result` with `edit` in between, error reads, command signals, no-HTTP short circuit.

## Verify

`pnpm --filter coding-agent test:unit tests/unit/pruning/supersession.test.ts`

## Notes

- Spec section: D5 Phase 0 (full detail).
