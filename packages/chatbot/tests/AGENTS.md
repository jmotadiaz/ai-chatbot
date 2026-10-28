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
consumer:

- `tests/mocks/gateway/server.ts` owns the chatbot's scenario: the catalog is
  defined in `catalog.ts`, and `chatReply()` in `server.ts` maps each model id to a
  toolkit reply builder (`textReply`, `toolCallReply`, `pacedTextReply`, …).
- It also owns the canonical `:4001` lifecycle (`ensureMockGateway` /
  `isMockGatewayAlive` / `stopMockGateway`), used by the Vitest global setup and
  the Playwright E2E global setup/teardown.
- `mockGatewayScenario.handlers` is the same scenario through MSW, for in-process
  tests that must not require a listening server (`setupServer(...handlers)`); the
  consumer owns the MSW lifecycle.

Tool continuations (e.g. `canExecuteTools`) derive their turn from the request
history (`role: "tool"`), never from a first/second-call counter.

### Adding a New Capability

1. Add an entry to `TEST_MODELS` in `tests/mocks/gateway/catalog.ts`
   (`MockCatalogEntry` schema = the Gateway's `GatewayModelEntry`).
2. If it needs special behaviour, add a `case` to `chatReply()` in
   `tests/mocks/gateway/server.ts`, composing a toolkit reply builder (a reply
   description; both the streaming and JSON renderings come from it).
3. Use the new id directly from the e2e specs / component objects.

Unsupported ids must not fall through to a generic success: return `undefined`
from a chat responder and the toolkit answers `422 unsupported_model`.

### Stream/chunk builders for in-process fakes

Pure `LanguageModelV3StreamPart` helpers (`textChunks`, `finishChunk`, …)
live in `tests/helpers/stream-chunks.ts` — copy of the old `inference/testing`
builders, which went away with that package.
