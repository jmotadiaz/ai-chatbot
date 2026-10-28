# Test Conventions

## Capability ids (Mock Model Gateway catalog)

Since the Model Gateway (ADR 0010) there is no alias layer: the chat model
ids the e2e suite selects in the picker are the ids of the catalog served by
the **Mock Model Gateway** (`tests/mocks/gateway/`, `:4001`) — the ids ARE the
capabilities.

| Id | Use when the test needs... |
|-------|-------------|---------------------------|
| `basicChat` | Plain text response (it is the `isDefault`) |
| `basicChatAlt` | A second plain text response (hub panels) |
| `canExecuteTools` | Tool execution (webSearch) |
| `canSeeImages` | Multimodal (image + text) |
| `canProduceReasoning` | Thinking/reasoning blocks |
| `alwaysRefuses` | Refusal response (temperature 1) |
| `failsMidStream` | Mid-stream error |
| `slowStream` | Paced multi-chunk text stream (stream resume / disconnect tests) |

### Usage

```ts
// The ids are already semantic — use them directly:
chatPage.header.modelPicker.selectModel("canExecuteTools");
hubPage.header.addModel("canSeeImages");

// When a test needs to assert on the model name (panel titles, tabs), use
// the same id:
const TOOLS_MODEL = "canExecuteTools";
hubPage.getPanel(TOOLS_MODEL);
```

### Where the behaviour lives

The reusable protocol and lifecycle mechanisms (reply builders, rendering, SSE
framing, MSW handlers, HTTP server, recorded requests, explicit errors) live in
the official toolkit
[`packages/model-gateway/js`](../../model-gateway/js/README.md)
(`@ai-chatbot/model-gateway-testing`, ADR 0013). The chatbot harness is a thin
consumer split into three modules under `tests/mocks/gateway/`:

- `catalog.ts` — `TEST_MODELS` (the user-invocable capability ids) and
  `TEST_INTERNAL_MODELS` (the `*-default` Default Model Contracts). It is
  registered once when the mock starts and never mutated per test: the
  application caches the catalog per process (60 s TTL).
- `profiles.ts` — the NAMED execution profiles: one explicit chat reply per
  model id (`chat`), explicit answers for the Decisions questions (`decisions`)
  and the embeddings/rerank/speech operations, plus the fixtures the specs
  assert on (`SLOW_STREAM_*`, `MOCK_IMAGE_PNG_BASE64`). `E2E_PROFILE` is the
  profile `:4001` serves. Responders derive their answer from the request alone
  (history, temperature, prompt), so there are no queues, counters or resets
  between journeys.
- `server.ts` — composition root: binds catalog + profile with
  `createGatewayScenario` and owns the canonical `:4001` lifecycle
  (`ensureMockGateway` / `isMockGatewayAlive` / `stopMockGateway`) used by the
  Vitest global setup and the Playwright global setup/teardown. It re-exports
  the fixtures above, which are what most tests import.
- `main.ts` — CLI to run the mock on its own.

`mockGatewayScenario.handlers` is the same scenario through MSW, for in-process
tests that must not require a listening server (`setupServer(...handlers)`); the
consumer owns the MSW lifecycle.

Tool continuations (e.g. `canExecuteTools`) derive their turn from the request
history (`role: "tool"`), never from a first/second-call counter.

### Adding a New Capability

1. Add an entry to `TEST_MODELS` in `tests/mocks/gateway/catalog.ts`
   (`MockCatalogEntry` schema = the Gateway's `GatewayModelEntry`: `isDefault`,
   `temperature`, `supportedFiles`, `reasoning`, `thinkingLevels`, …). Add it to
   `TEST_INTERNAL_MODELS` instead if it is a `*-default` contract the user does
   not pick.
2. Add its answer to the `chat` map of the profile in
   `tests/mocks/gateway/profiles.ts`, composing a toolkit reply builder
   (`textReply`, `toolCallReply`, `pacedTextReply`, …). Both the streaming and
   the JSON rendering come from that one description; no protocol code is
   written here.
3. Use the new id directly from the e2e specs / page objects.

Unsupported ids do not fall through to a generic success: an id missing from the
profile is answered with the toolkit's explicit `422 unsupported_model`, so a
missing profile is visible in the run.

Internal operations use the same map. Compaction's `reasoning-default` /
`vision-default` are plain entries; `fast-default` serves four operations (chat
title, memory query decomposition, memory fact extraction, URL intent
classification), and since the OpenAI-compatible transport sends
`response_format` without its schema, that responder discriminates on the
operation's system prompt. A `fast-default` operation the profile does not know
is an explicit `422`, never a guessed JSON body.

### Adding a Decisions answer (Chat Mode Routing)

The profile declares the criterion each Decisions question is answered with.
Every Environment runs the production Chat Mode Router, so this entry is what
makes the Auto journeys deterministic:

```ts
// tests/mocks/gateway/profiles.ts
decisions: {
  // `mode` is CHAT_MODE_ROUTING_QUESTION_KEY; `ctx7` is the routing question's
  // first criterion and resolves to the `context7` Chat Mode.
  mode: "ctx7",
}
```

The toolkit only renders the answer (`decisionsResponse(request, { choices })`);
the consumer owns it. A test builds it with `answerDecision`,
`answerDecisionWith` or `answerDecisionRaw` (`tests/helpers/gateway-decisions.ts`)
for a healthy answer, an answer with overlain fields, and the malformed payloads
a healthy profile never sends. An undeclared question, or a criterion the question does
not offer, is an explicit `422`. A journey that must route elsewhere declares
that criterion (or a function of the request's `state`, for routing derived
from the message) — never a global switch: the same `:4001` mock serves every
journey and its catalog/profile are not reconfigured mid-run.

### Social unit tests at the Gateway seam

Feature tests do not inject AI ports or fakes. They install one gateway scenario
per test with the consumer helper
`tests/helpers/gateway-harness.ts` (`setupGatewayHarness().use({ chat, embeddings,
rerank, decisions })`), exercise the feature through its public interface and
audit `scenario.requests` for the contracts, parameters and inputs that matter:

```ts
const gateway = setupGatewayHarness();

it("uses the text contract", async () => {
  const scenario = await gateway.use({ chat: () => textReply("summary") });
  await theFeatureUnderTest();
  expect(scenario.requests.at(0)?.body).toMatchObject({ model: "reasoning-default" });
});
```

The harness owns only the MSW lifecycle (`onUnhandledRequest: "error"`) and the
catalog warm-up the kit needs before resolving models synchronously; the catalog
and every responder stay consumer-owned. Its `server` is exposed for the one
condition a scenario cannot express — a responder is synchronous, so a response
slower than a feature's timeout needs an ad-hoc MSW handler. Persistence uses `setupTestDb()` (PGlite
in memory), so these tests need neither a PostgreSQL container nor a gateway
listening on `:4001`.

### Stream/chunk builders for in-process fakes

Pure `LanguageModelV3StreamPart` helpers (`textChunks`, `finishChunk`, …)
live in `tests/helpers/stream-chunks.ts` — copy of the old `inference/testing`
builders, which went away with that package.
