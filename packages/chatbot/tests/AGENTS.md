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

The behaviour behind each id is decided by the Mock Model Gateway's
`POST /v1/chat/completions` handler (`tests/mocks/gateway/server.ts`), keyed
by the requested `model` — the same surface as the real LiteLLM Gateway.
There are no in-memory mock clients in the chatbot anymore.

### Adding a New Capability

1. Add an entry to `TEST_MODELS` in `tests/mocks/gateway/catalog.ts`
   (`MockCatalogEntry` schema = the Gateway's `GatewayModelEntry`).
2. If it needs special behaviour, branch on its id in the
   `/v1/chat/completions` handler of `tests/mocks/gateway/server.ts`.
3. Use the new id directly from the e2e specs / component objects.

### Stream/chunk builders for in-process fakes

Pure `LanguageModelV3StreamPart` helpers (`textChunks`, `finishChunk`, …)
live in `tests/helpers/stream-chunks.ts` — copy of the old `inference/testing`
builders, which went away with that package.
