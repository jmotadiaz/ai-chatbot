# 01 — Gateway toolkit: `noul` question support in `decisionsResponse`

Status: ready-for-agent
Blocked by: —

## Scope

`packages/model-gateway/js` (the official `@ai-chatbot/model-gateway-testing` toolkit) only — no coding-agent code.

`decisionsResponse` in `js/src/protocol.ts` currently renders answers only for `type: "choice"` questions and silently skips everything else. Tool Pruning (see [spec](../spec.md) D5/D6) asks `type: "noul"` questions (numeric probability in `[0, 1]`, "probability the model would still use object X"). Extend the renderer so the Mock Gateway can serve them at the official HTTP seam (`POST /v1/decisions` and `POST /v1/systemone` are already routed to `config.decisions` in `js/src/scenario.ts`).

## Requirements

1. `decisionsResponse` accepts questions with `type: "noul"` and answers them with a numeric probability:
   - Default `0.5` when no override is declared.
   - New option `nouls?: Readonly<Record<string, number>>` overrides per-question values. Values outside `[0, 1]` are invalid configuration => throw (same convention as the existing `choices` validation).
   - A `nouls` key that does not match a `noul` question in `request.questions` => throw (not a silent no-op).
   - The answer body shape for a `noul` question must carry the numeric probability in the position/field the Decisions API uses for `noul` answers (check `js/src/types.ts` for `DecisionsRequest`/question types and extend them minimally; keep the rendered body consistent with how LiteLLM's Decisions API returns numeric answers — if `js/src/types.ts` lacks the type, add `noul` to the question union and a numeric field to the answer union).
2. `choice` behavior must remain byte-identical for existing tests.
3. Update unit tests in `js/tests/unit/protocol.test.ts` and, if it covers decisions, `js/tests/unit/scenario.test.ts` (default `0.5`, override, `[0,1]` validation, invalid-key throw, mixed choice+noul request).

## Verify

`pnpm --filter @ai-chatbot/model-gateway-testing test:unit` (check the actual package name in `packages/model-gateway/js/package.json`).

## Notes

- Verified facts: [codebase-facts.md](../notes/codebase-facts.md) § Model Gateway JS toolkit.
- Spec section: D6 (Testing Decisions — extend `decisionsResponse` for `noul`).
