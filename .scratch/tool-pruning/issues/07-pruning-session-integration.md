# 07 — Session integration tests (`session-integration.test.ts`)

Status: ready-for-agent
Blocked by: 06

## Scope

`packages/coding-agent/tests/unit/pruning/session-integration.test.ts` — in-process worker integration tests using `createTestWorkerContext()` + the worker gateway harness (MSW; never `.pi-prod`/`.pi-dev` or `process.env`). Find the harness by searching `tests/` for `setupWorkerGatewayHarness` / how existing session tests drive turns, and follow that pattern.

Five scenarios per the spec Testing Decisions:

1. Below watermark (`< 45 %`): a short session produces **zero** `/v1/systemone` calls and byte-identical provider `messages`.
2. Monotonic watermark progression (`[0.45, 0.60, 0.75]`): crossing a watermark (e.g. starting at `60 %` and dropping to `50 %` after pruning) runs the epoch, masks the `messages` payload sent to `/v1/chat/completions` (stubbed results, dropped calls, pairing integrity) while keeping the UI/event log transcript intact, and **does not re-trigger** on the next turn at `54 %` (since both `0.45` and `0.60` are now deactivated), only triggering again once `0.75` is crossed.
3. Cold reload: reopen the session from disk (`SessionManager`/`SessionRegistry`) and confirm both masks and consumed watermarks reapply from persisted `tool-pruning` entries without new `/v1/systemone` calls.
4. Message Edit & Compaction rearm: prune in a later turn, rewind to a previous message, and confirm masks and consumed watermarks from the abandoned branch no longer apply; and verify that after a Pi `compaction` entry in the session branch, the `[0.45, 0.60, 0.75]` watermarks are automatically rearmed.
5. Fail-open: `/v1/systemone` responds 500 (then timeout, if feasible) — turn completes, current watermark is consumed (no retry storm on the immediate next step), and remaining candidates stay eligible when the session reaches the next watermark step.

## Verify

`pnpm --filter coding-agent test:unit tests/unit/pruning/session-integration.test.ts`

## Notes

- Verified facts: [codebase-facts.md](../notes/codebase-facts.md) § Testing conventions.
- Spec section: Testing Decisions bullet 4.
- Depends on the full wiring from ticket 06.
