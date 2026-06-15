# Test Conventions

## Capability Aliases

When selecting an AI model in e2e tests, prefer **semantic capability aliases** over hard-coded model display names.

### Available Aliases

| Alias | Resolves to | Use when the test needs... |
|-------|-------------|---------------------------|
| `basicChat` | Gemini 3 Flash | Plain text response |
| `canExecuteTools` | Claude Sonnet 4.6 | Tool execution (webSearch) |
| `canSeeImages` | Gemini 3 Flash | Multimodal (image + text) |
| `canProduceReasoning` | Deepseek v4 Pro | Thinking/reasoning blocks |
| `alwaysRefuses` | Kimi K2.6 | Refusal response |
| `failsMidStream` | GPT OSS | Mid-stream error |

### Usage

```ts
// Prefer this (expresses intent):
chatPage.header.modelPicker.selectModel("canExecuteTools");
hubPage.header.addModel("canSeeImages");

// Only use direct names for edge cases:
chatPage.header.modelPicker.selectModel("Claude Sonnet 4.6");
```

### Adding a New Alias

1. If the capability requires a new mock behavior, create the mock in `tests/mocks/ai/helpers/models/` and register it in `tests/mocks/ai/registry.ts`
2. Add the alias to `CAPABILITY_ALIASES` in `tests/mocks/ai/capabilities.ts`, mapping to the model's display name
3. The new alias automatically becomes available as a `CapabilityAlias` union type

```ts
// tests/mocks/ai/capabilities.ts
export const CAPABILITY_ALIASES = {
  // ... existing aliases ...
  myNewCapability: "Display Name of Model",
} as const satisfies Record<string, string>;
```

### Resolution

Aliases are resolved in `ModelPickerComponent.selectModel()` and `HubHeaderComponent.addModel()`. The resolution is test-side only — the alias never reaches the application.
