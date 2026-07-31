# Test Conventions

## Capability Aliases

When selecting an AI model in e2e tests, prefer **semantic capability aliases** over hard-coded model display names.

### Available Aliases

| Alias | Resolves to | Use when the test needs... |
|-------|-------------|---------------------------|
| `basicChat` | MiMo V2.5 Pro | Plain text response |
| `basicChatAlt` | Kimi K2.7 Code | A second plain text response (hub panels) |
| `canExecuteTools` | Deepseek v4 Flash | Tool execution (webSearch) |
| `canSeeImages` | Qwen 3.7 Plus | Multimodal (image + text) |
| `canProduceReasoning` | Deepseek v4 Pro | Thinking/reasoning blocks |
| `alwaysRefuses` | MiniMax M3 | Refusal response |
| `failsMidStream` | MiMo V2.5 | Mid-stream error |

### Usage

```ts
// Prefer this (expresses intent):
chatPage.header.modelPicker.selectModel("canExecuteTools");
hubPage.header.addModel("canSeeImages");

// When a test needs to assert on the model name (panel titles, tabs), read it
// from the alias instead of hard-coding it:
const TOOLS_MODEL = CAPABILITY_ALIASES.canExecuteTools;
hubPage.getPanel(TOOLS_MODEL);
```

### Adding a New Alias

1. If the capability requires a new mock behavior, create the mock in `tests/mocks/ai/helpers/models/` — one file per behavior, named after the behavior — and register it in `tests/mocks/ai/registry.ts`
2. Add the alias to `CAPABILITY_ALIASES` in `tests/mocks/ai/capabilities.ts`, mapping to the model's display name
3. The new alias automatically becomes available as a `CapabilityAlias` union type

```ts
// tests/mocks/ai/capabilities.ts
export const CAPABILITY_ALIASES = {
  // ... existing aliases ...
  myNewCapability: "Display Name of Model",
} as const satisfies Record<string, chatModelId>;
```

The `satisfies Record<string, chatModelId>` is deliberate: it fails the type check if an alias points at a model that is no longer selectable in the chat.

### Resolution

Aliases are resolved in `ModelPickerComponent.selectModel()` and `HubHeaderComponent.addModel()`. The resolution is test-side only — the alias never reaches the application.

A model only gets its specialized mock if it is listed in `tests/mocks/ai/registry.ts`; every other model falls back to the generic `createMockModel`. The registry is keyed by catalog id and `lib/infrastructure/ai/providers.ts` translates the provider-level id back to it via `MODEL_CATALOG`.
