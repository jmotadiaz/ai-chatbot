# 07 — Session integration tests (`session-integration.test.ts`)

Status: ready-for-agent
Blocked by: 06

## Scope

`packages/coding-agent/tests/unit/pruning/session-integration.test.ts` — in-process worker integration tests using `createTestWorkerContext()` + the worker gateway harness (MSW; never `.pi-prod`/`.pi-dev` or `process.env`). Find the harness by searching `tests/` for `setupWorkerGatewayHarness` / how existing session tests drive turns, and follow that pattern.

Five scenarios per the spec Testing Decisions:

1. Below watermark: a short session produces **zero** `/v1/systemone` calls and byte-identical provider `messages`.
2. Watermark crossing in Turn T: epoch runs; assert the `messages` payload the mock `/v1/chat/completions` receives (stubbed results, dropped calls, pairing integrity) and that the transcript returned to the UI/event log remains intact.
3. Cold reload: reopen the session from disk (`SessionManager`/`SessionRegistry`) and confirm masks reapply from persisted `tool-pruning` entries without new `/v1/systemone` calls.
4. Message Edit: prune in a later turn, rewind to a previous message, and confirm masks from the abandoned branch no longer apply (original tool result back in the provider payload).
5. Fail-open: `/v1/systemone` responds 500 (then timeout, if feasible) — turn completes, candidates remain eligible after the cooldown growth.

## Verify

`pnpm --filter coding-agent test:unit tests/unit/pruning/session-integration.test.ts`

## Notes

- Verified facts: [codebase-facts.md](../notes/codebase-facts.md) § Testing conventions.
- Spec section: Testing Decisions bullet 4.
- Depends on the full wiring from ticket 06.
