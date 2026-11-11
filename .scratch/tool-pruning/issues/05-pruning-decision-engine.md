# 05 — Decision engine: `decision-state.ts` + `systemone-client.ts`

Status: ready-for-agent
Blocked by: 03

## Scope

Two pure/testable modules per spec D5 Phase 1 and D6:

1. `src/pruning/decision-state.ts`:
   - Build the compact `state` document (`goal` from last user messages + assistant plan + CompactionSummary extract; `recentProtectedDigest` of what the Cooling Window already preserves; `timeline` with per-Turn digests and candidate entries `c1..cN` with `tool`, `args` (≤ 400 chars, preserving path/pattern/command), `chars`, `tokensEst`, `isError`, Phase 0 flags, `preview` = head(200)+" … "+tail(200)).
   - Budget: `maxDecisionStateTokens` (20k, chars/4); compress old-Turn prose first, candidate args/preview last.
   - Questions: 2 `noul` (`call_cK`, `result_cK`) for successful exploratory calls; 1 (`result_cK`) for `bash` and for eligible big errors; each with concise `criteria: { true, false }` anchored in goal/digest/supersession flags.
   - Batching: ≤ 80 questions/request and ≤ 28k total tokens; split into ≤ `maxDecisionBatches` (3) concurrent requests prioritizing largest+oldest candidates; leftover small candidates stay `keep`.
   - Apply the two-band policy to answers: normal mode (`keepResult >= 0.25` => keep; `keepResult < 0.25` => `drop_call` if tool allows and `keepCall < 0.15`, else `drop_result`); emergency mode applies high-confidence drops first, then extends `drop_result`-only over the `[0.25, 0.40)` band ordered by `keepResult / log2(tokensEst)` until `activeTokens <= emergencyTargetRatio` or band exhausted.
   - Missing/invalid answer key => probability `1.0` => keep.
2. `src/pruning/systemone-client.ts`:
   - `fetch`-based client for `POST ${baseUrl}/systemone` (baseUrl already ends in `/v1`), bearer apiKey (+ extra headers from `getApiKeyAndHeaders`), `decision-default` model.
   - `AbortSignal.any([AbortSignal.timeout(decisionTimeoutMs), ...turnSignals])`; defensive JSON validation; typed result; error/timeout/invalid => typed failure (caller decides fail-open, ticket 06).

Unit tests `tests/unit/pruning/decision-state.test.ts` (state budgeting order, question counts per tool type, batching split + priority, two-band policy, emergency ranking) and `tests/unit/pruning/systemone-client.test.ts` (happy path, 4s timeout, abort, invalid JSON, missing key => 1.0). Use the `@ai-chatbot/model-gateway-testing` MSW harness where an HTTP seam is needed (see [codebase-facts](../notes/codebase-facts.md)).

## Verify

`pnpm --filter coding-agent test:unit tests/unit/pruning/decision-state.test.ts tests/unit/pruning/systemone-client.test.ts`

## Notes

- Spec sections: D5 Phase 1, D6, parameter table.
- Ticket 01 adds `noul` rendering to the toolkit's `decisionsResponse` — coordinate via that ticket's merge, or if it has already merged just use it.
