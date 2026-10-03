# Test Conventions

## Capability Aliases

When selecting an AI model in e2e tests, prefer **semantic capability aliases** over hard-coded model display names.

### Available Aliases

| Alias | Resolves to | Use when the test needs... |
|-------|-------------|---------------------------|
| `basicChat` | Kimi K3 | Plain text response |
| `basicChatAlt` | GLM 5.3 | A second plain text response (hub panels) |
| `canExecuteTools` | Deepseek v4.1 Flash | Tool execution (webSearch) |
| `canSeeImages` | Qwen 3.8 Flash | Multimodal (image + text) |
| `canProduceReasoning` | Muse Spark 1.3 | Thinking/reasoning blocks |
| `alwaysRefuses` | MiniMax M3 | Refusal response |
| `failsMidStream` | Hy3 | Mid-stream error |

### Usage

```ts
// Prefer this (expresses intent):
chatPage.header.modelPicker.selectModel("canExecuteTools");
hubPage.header.addModel("canSeeImages");

// When a test needs to assert on the model name (panel titles, tabs), read it
// from the alias instead of hard-coding it:
const TOOLS_MODEL = CAPABILITY_ALIASES.canExecuteTools.id;
hubPage.getPanel(TOOLS_MODEL);
```

### Where the mock builders live

The AI SDK mock constructors are **not** chatbot test code: they live in the
`inference` package's `inference/testing` subpath
(`packages/inference/src/testing/`), model-id-free, so the coding-agent worker
can reuse them too. That subpath exports:

- `createMockModel(modelId)` / `createMockEmbeddingModel()` — the generic,
  content-driven fallback mocks (`mock-model.ts`).
- Chunk/stream builders (`chunks.ts`, `streams.ts`) — pure `LanguageModelV3StreamPart`/
  `LanguageModelV3StreamResult` helpers with no model coupling at all.
- Five ready-made behaviours, each a `MockModelEntry` (`{ capabilities, languageModel }`):
  `MOCK_TOOL_EXECUTION`, `MOCK_VISION`, `MOCK_REASONING`, `MOCK_REFUSAL`,
  `MOCK_MID_STREAM_ERROR` — one file per behaviour, named after it.

Binding any of the above to a real, selectable model is entirely this
package's concern (`tests/mocks/ai/capabilities.ts`), never `inference`'s.

### Adding a New Alias

1. If the capability requires a new mock behavior, add it to
   `packages/inference/src/testing/` (one file per behaviour, named after it,
   exported from `src/testing/index.ts`) — unless an existing behaviour
   already fits.
2. Add the alias to `CAPABILITY_ALIASES` in `tests/mocks/ai/capabilities.ts`,
   as `{ id, requires }`: `id` is the model's catalog display name, `requires`
   declares what the behaviour assumes about that catalog entry (see below).
3. If the alias needs a specialised behaviour (not the generic mock), bind it
   in `ALIAS_BEHAVIOURS`, in the same file, keyed by alias.
4. The new alias automatically becomes available as a `CapabilityAlias` union
   type.

```ts
// tests/mocks/ai/capabilities.ts
export const CAPABILITY_ALIASES = {
  // ... existing aliases ...
  myNewCapability: { id: "Display Name of Model", requires: { imageInput: true } },
} as const satisfies Record<string, { id: InvocableModelId; requires: AliasRequirements }>;

export const ALIAS_BEHAVIOURS: Partial<Record<CapabilityAlias, MockModelEntry>> = {
  // ... existing bindings ...
  myNewCapability: MOCK_MY_NEW_BEHAVIOUR,
};
```

The `satisfies Record<string, { id: InvocableModelId; ... }>` is deliberate: it
fails the type check if an alias points at a model that is no longer
selectable in the chat.

### `requires`: what a mock assumes about the catalog

Each alias's `requires` declares, in a catalog-checkable way, what its mock
behaviour assumes about the Model Catalog entry `id` resolves to:

- `imageInput: true` — the entry's `supportedFiles` must include `"img"`
  (`canSeeImages`).
- `reasoning: true` — the entry's `reasoning` must be `true`
  (`canProduceReasoning`).
- `distinctTemperatureFrom: "<otherAlias>"` — the entry's `temperature` must
  differ from the named alias's (`alwaysRefuses` vs. `basicChat`:
  `settings.spec` switches between the two and asserts the temperature input
  actually changes value).
- `plainMock: true` — this alias has **no** entry in `ALIAS_BEHAVIOURS`; it
  must resolve through the generic `createMockModel` (`basicChat`,
  `basicChatAlt`).

An alias with no catalog-checkable assumption (e.g. `canExecuteTools`,
`failsMidStream` — a mid-stream error or tool call is a mock-harness choice,
not a catalog capability) declares `requires: {}`.

### Alias invariants (unit test)

`tests/unit/mocks/ai/capabilities.test.ts` checks, for every alias:

1. Its catalog entry (`MODEL_CATALOG.find(e => e.id === alias.id)`) satisfies
   everything declared in `requires`.
2. Every alias points at a **distinct** catalog id.
3. A behaviour is registered in `ALIAS_BEHAVIOURS` if and only if the alias is
   **not** `plainMock`.

A failing assertion names both the alias and the unmet property (e.g.
`alias "canSeeImages": requires.imageInput but catalog entry "Qwen 3.8 Flash"
has supportedFiles=[] (missing "img")`), so a Model Catalog edit that breaks
one of these assumptions fails loudly here instead of breaking e2e silently.

### Resolution

Aliases are resolved in `ModelPickerComponent.selectModel()` and
`HubHeaderComponent.addModel()`: `CAPABILITY_ALIASES[alias]?.id ?? literal`.
The resolution is test-side only — the alias never reaches the application.

The chatbot's test-mode composition root
(`lib/infrastructure/ai/inference-kit.ts`) builds the resolver that actually
backs each mocked provider client: catalog entry → alias (via
`CAPABILITY_ALIASES`, matched by catalog id) → behaviour (via
`ALIAS_BEHAVIOURS`). A model only gets its specialised mock if its alias is
listed in `ALIAS_BEHAVIOURS`; every other model — including the two
`plainMock` aliases — falls back to the generic `createMockModel`.
