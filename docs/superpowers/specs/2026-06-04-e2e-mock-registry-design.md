# E2E Mock Model Registry — Design

**Date:** 2026-06-04
**Status:** Approved (design phase complete)
**Scope:** End-to-end (Playwright) tests only

## Context

The current e2e test setup mocks all AI models with a single `MockLanguageModelV3` (`tests/mocks/ai.ts`) that is **content-driven**: it inspects the prompt to decide what to return. This mock:

- Hard-codes knowledge of system prompts (e.g., the literal string `"Determine if a user's request necessitates the use of the 'web search' tool"`)
- Extracts routing decisions via regex on the user message (`category=`, `complexity=`)
- Embeds the `modelId` directly into the streamed text so tests can assert on it (`toContain("gemini")`)
- Returns the same behavior for every provider, regardless of which model was selected

The current `withMessageProcessing` helper in `lib/features/chat/agents/utils.ts:37` also forces `activeTools: []` in test mode, making it impossible to test real tool-execution flows.

This design proposes replacing the single content-driven mock with a **registry of mock models**, each with its own behavior, while keeping the same UX: tests select the model via the existing model picker UI.

## Goals

- Replace the single content-driven mock with a registry of behavior-focused mocks
- Support testing of flows that are currently impossible: tool execution, multimodal, errors, thinking blocks
- Keep the existing test pattern: select model via UI, assert on visible behavior
- Each mock expresses **what it does** (capabilities, behavior) rather than **what it is** (content-driven decoding)
- Type-safe mock IDs auto-derived from the registry

## Non-Goals

- Unit tests: keep current port-based mock-on-demand pattern
- Evals: out of scope (separate eval system)
- Real provider behavior: mocks are not intended to perfectly mimic real models
- HTTP/network mocking: the mock lives at the SDK layer, not the network layer

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mock abstraction shape | Concrete instances (one per real-model analog + variations) | Clear intent, discoverable, type-safe |
| Selection mechanism | UI model picker (no cross-process fixture) | Test and app run in separate processes — no shared JS state possible |
| Mock IDs | Expressive, behavior-focused (`claudeSonnetVision`, `claudeSonnetWithTools`) | Decouples tests from real model names; supports multiple mocks per real model |
| Bridge to UI | `getAvailableModels()` abstraction, test mode returns mock entries | Keeps model picker working in test mode |
| Provider layer | `providers.ts` switches in test mode, returns mock for IDs in registry | Single source of truth for "which model is which" in test mode |
| Provider layer: unknown ID | Throws (final state); during Phase 1 only, returns the generic fallback mock | Strict in the end; lenient during transition to avoid breaking existing tests |
| `activeTools: []` hack | Eliminated entirely | The mock is now the source of truth for "I will use tools" |
| Internal mock composition | Thin helpers over `MockLanguageModelV3` native capabilities | SDK already supports array of results (multi-step), all stream chunk types, delays |
| Type augmentation | Auto-derived `MockModelId = keyof typeof MOCK_MODELS`, augmented via `.d.ts` | Adding a mock to the registry automatically extends the type |
| Migration | Incremental per test | Old mock works as fallback during transition |
| Default model in test | No special logic — test environment has no API keys | Failing fast is acceptable; tests always select a model explicitly |
| Embedding/rerank | Out of scope — keep current single mock | Only relevant if tools actually run; tests use mocked tool results |
| Test-the-test (unit tests for mocks) | YAGNI — e2e tests catch mock bugs implicitly | Redundant layer |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Test                                                           │
│  chatPage.header.modelPicker.selectModel("canExecuteTools")     │
│    → CAPABILITY_ALIASES["canExecuteTools"]                      │
│    → "Claude Sonnet 4.6" (resolved in model-picker.ts)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  HeaderComponent (app)                                          │
│  consumes getAvailableModels() → mock entries in test mode     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  lib/features/foundation-model/available-models.ts              │
│  if (isTestMode()) return Object.values(MOCK_MODELS).map(...)   │
│  else return CHAT_MODELS.map(...)                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (modelId flows through chat config)
┌─────────────────────────────────────────────────────────────────┐
│  lib/infrastructure/ai/providers.ts                             │
│  isTestMode() → buildTestProviders()                            │
│  - lookupMock(modelId) → MOCK_MODELS[modelId].languageModel     │
│  - throws if modelId not in registry (no silent fallback)       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  tests/mocks/ai/                                                │
│  - registry.ts: MOCK_MODELS = { ... }                           │
│  - helpers/chunks.ts: textChunks, reasoningChunks, toolCallChunks, fileChunks, errorChunk, finishChunk │
│  - helpers/streams.ts: textStream, reasoningStream, toolCallStream, fileStream, errorStream │
│  - helpers/models/*.ts: individual mock definitions            │
│  - augmentation.d.ts: type augmentation for LanguageModelKeys  │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
tests/mocks/ai/
├── index.ts                      # re-exports
├── types.ts                      # MockModelId, MockCapabilities, MockModelEntry
├── registry.ts                   # MOCK_MODELS, MockModelId (auto-derived)
├── augmentation.d.ts             # type augmentation
├── capabilities.ts               # CAPABILITY_ALIASES map + CapabilityAlias type
├── helpers/
│   ├── chunks.ts                 # LanguageModelV3StreamPart builders
│   ├── streams.ts                # LanguageModelV3StreamResult builders
│   └── models/
│       ├── claudeSonnet.ts
│       ├── claudeSonnetVision.ts
│       ├── claudeSonnetWithTools.ts
│       ├── deepseekV4Thinking.ts
│       ├── refusalModel.ts
│       └── errorModel.ts

lib/features/foundation-model/
├── available-models.ts           # NEW: getAvailableModels() abstraction
├── config.ts                     # UNCHANGED
└── types.ts                      # UNCHANGED

lib/infrastructure/ai/
└── providers.ts                  # MODIFIED: isTestMode() → buildTestProviders()

lib/features/chat/agents/
└── utils.ts                      # MODIFIED: remove IS_TEST_ENV hack from withMessageProcessing
```

## Type System

```ts
// tests/mocks/ai/types.ts
export type MockModelId = keyof typeof MOCK_MODELS; // auto-derived

export interface MockCapabilities {
  multimodal?: boolean;
  toolExecution?: boolean;
  thinkingBlocks?: boolean;
  streamDelays?: boolean;
  errorScenarios?: Array<'refusal' | 'rate_limit' | 'timeout' | 'mid_stream_error'>;
}

export interface MockModelEntry {
  id: MockModelId;
  displayName: string;
  capabilities: MockCapabilities;
  languageModel: LanguageModelV3;
}

// tests/mocks/ai/registry.ts
export const MOCK_MODELS = {
  claudeSonnet: MOCK_CLAUDE_SONNET,
  claudeSonnetVision: MOCK_CLAUDE_SONNET_VISION,
  claudeSonnetWithTools: MOCK_CLAUDE_SONNET_WITH_TOOLS,
  // ... add a mock here → MockModelId extends automatically
} as const satisfies Record<string, MockModelEntry>;
```

Type augmentation in `tests/mocks/ai/augmentation.d.ts` extends `LanguageModelKeys` (the union of valid model IDs) to include mock IDs, so call sites in test code can use mock IDs without casts.

## Initial Mock Catalog

| Mock ID | Display Name | Capabilities | Behavior |
|---------|--------------|--------------|----------|
| `claudeSonnet` | Claude Sonnet | text | Plain text response, deterministic |
| `claudeSonnetVision` | Claude Sonnet (Vision) | multimodal | Returns a PNG image + text |
| `claudeSonnetWithTools` | Claude Sonnet (With Tools) | toolExecution | First call: emits webSearch tool call. Second call (after tool result): emits text |
| `deepseekV4Thinking` | Deepseek V4 (Thinking) | thinkingBlocks | Emits reasoning chunks followed by text |
| `refusalModel` | Refusal Model | errorScenarios: ['refusal'] | Always emits refusal text |
| `errorModel` | Error Model | errorScenarios: ['mid_stream_error'] | Emits error chunk mid-stream |

Additional mocks can be added to the catalog as needed.

## Capability Aliases

To decouple test specs from specific model names, tests select models via **semantic capability aliases** (e.g., `"canExecuteTools"`) rather than hard-coded model display names. A central map in the mock infrastructure translates aliases to the underlying model display name.

### Rationale

- **Specs express intent**: `selectModel("canExecuteTools")` says *what* behavior the test needs, not *which* model provides it
- **Changes are centralized**: when a real AI model is deprecated or replaced, only the alias map changes — not N test specs
- **Type-safe**: `CapabilityAlias` is a union type derived from the map, so IDEs autocomplete

### Alias Map

```ts
// tests/mocks/ai/capabilities.ts
export const CAPABILITY_ALIASES = {
  basicChat: "Deepseek v4 Flash",      // Plain text, fast response
  canExecuteTools: "Claude Sonnet 4.6", // Tool execution (webSearch)
  canSeeImages: "Gemini 3 Flash",      // Multimodal (image + text)
  canProduceReasoning: "Deepseek v4 Pro", // Thinking blocks
  alwaysRefuses: "Kimi K2.6",          // Refusal responses
  failsMidStream: "GPT OSS",           // Mid-stream error
} as const satisfies Record<string, string>;

export type CapabilityAlias = keyof typeof CAPABILITY_ALIASES;
```

### Resolution Mechanism

The `ModelPickerComponent.selectModel()` method accepts `chatModelId | CapabilityAlias`. Internally, it checks the alias map first; if the input is a known alias, it resolves to the corresponding display name. Display names pass through unchanged.

```ts
// tests/e2e/chat/components/model-picker.ts
async selectModel(modelNameOrCapability: chatModelId | CapabilityAlias) {
  const resolved = CAPABILITY_ALIASES[modelNameOrCapability] ?? modelNameOrCapability;
  // ... existing picker interaction using `resolved`
}
```

This is a **test-side-only** resolution. The alias never reaches the application. The model picker UI, `providers.ts`, and the rest of the pipeline only see display names — exactly as they do today.

### Adding New Aliases

When a test needs a new capability:
1. Add the alias to `CAPABILITY_ALIASES`, pointing to a model already in `MOCK_MODELS`
2. If no existing mock satisfies the capability, create the mock first, add it to `MOCK_MODELS`, then map the alias
3. Use the new alias in the test spec

The process is documented in `tests/AGENTS.md`.

### Coexistence with Direct Model Names

Direct model name selection (e.g., `selectModel("Claude Sonnet 4.6")`) continues to work. This is useful for:
- Tests that specifically exercise a model's integration point
- Debugging individual mock behavior
- Edge cases where no alias captures the intent precisely

The convention is: **prefer aliases for normal tests, use direct names only when an alias doesn't apply.**

---

## Migration Plan

### Phase 1: Infrastructure (no test changes)

Build the new system alongside the existing one:
- Create `tests/mocks/ai/` with all infrastructure
- Add the test-mode branch to `providers.ts` that uses the new registry
- **For modelIds not in the registry, keep the old behavior** (return the generic content-driven mock) so existing tests continue to pass
- Create `getAvailableModels()` and update `HeaderComponent` to use it
- Remove the `activeTools: []` hack from `withMessageProcessing`
- Add the initial six mocks to the catalog

**Validation:** all existing e2e tests pass without modification.

### Phase 2: Migrate existing tests (incremental, per-test)

For each test in `tests/e2e/chat/`:
1. Identify which model the test selects via the picker
2. If a matching mock exists in the registry, update the test to use it explicitly
3. Update assertions from `toContain("modelName")` to behavior-focused assertions (e.g., `toContain("Based on search results")`)
4. If no matching mock exists, decide: add a new mock, or keep the test using the generic fallback

Each migration is one PR. Tests can be migrated opportunistically — no need to migrate all at once.

### Phase 3: New capabilities

Tests that were previously impossible can now be written:
- Tool execution flows (use `claudeSonnetWithTools`)
- Multimodal flows (use `claudeSonnetVision`)
- Error scenarios (use `refusalModel`, `errorModel`)
- Thinking-block display (use `deepseekV4Thinking`)

Each new test is added with its corresponding mock in the registry.

### Phase 4: Cleanup

**Trigger condition:** `pnpm test:e2e` passes AND a `grep` of the test suite finds zero references to modelIds that are not in `MOCK_MODELS`. Both must hold before removing the fallback.

Steps:
- Remove the fallback from `providers.ts` (the `lookupMock` function in `buildTestProviders` should throw for any modelId not in the registry)
- Delete `tests/mocks/ai.ts` (the old content-driven mock)
- Update `tests/e2e/README.md` to reflect the new architecture

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Type augmentation breaks in some build modes | Keep augmentation in a single `.d.ts` file; verify with `tsc --noEmit` in CI |
| Mock IDs drift from real model features | Capabilities are declared on the mock entry; can be linted or asserted in e2e |
| Test environment accidentally uses real provider | `isTestMode()` env check + no API keys in `.env.test` is the existing safeguard |
| Multi-step mocks become hard to debug | The `MockLanguageModelV3` SDK records `doStreamCalls: LanguageModelV3CallOptions[]`; tests can assert on recorded calls |
| HeaderComponent change breaks prod model picker | `getAvailableModels()` returns the real `CHAT_MODELS` in production — UI behavior is identical |

## Out of Scope

- Changing the unit test pattern (unit tests use port-based mocks on demand)
- Changing the evalite evals
- Mocking embedding/rerank models (only chat models are mocked)
- HTTP-level mocking (the mock lives at the SDK layer)
- Cross-process test-to-app signaling (the model picker UI is the only signaling channel)
