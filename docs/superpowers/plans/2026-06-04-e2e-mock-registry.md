# E2E Mock Model Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single content-driven AI mock in e2e tests with a registry of behavior-focused mocks (text, multimodal, tool execution, errors, thinking blocks), keeping the existing UI-based model selection.

**Architecture:** A new `tests/mocks/ai/` module holds the registry, type definitions, and thin helpers wrapping `MockLanguageModelV3` from `ai/test`. A new `getAvailableModels()` abstraction in `lib/features/foundation-model/available-models.ts` switches the model picker to show mock entries in test mode. The `lib/infrastructure/ai/providers.ts` test branch routes `modelId` to the corresponding mock. The `activeTools: []` hack in `withMessageProcessing` is removed so mocks can drive tool execution flows.

**Tech Stack:** TypeScript, Vercel AI SDK v6 (`ai@^6.0.39`, `@ai-sdk/provider@^3.0.4`), Playwright (existing), Vitest (for helper tests only — not for mocks themselves).

**Spec:** `docs/superpowers/specs/2026-06-04-e2e-mock-registry-design.md`

---

## File Structure

### Files to create

| Path | Responsibility |
|------|----------------|
| `tests/mocks/ai/types.ts` | `MockCapabilities`, `MockModelEntry` interfaces |
| `tests/mocks/ai/helpers/chunks.ts` | Chunk builders: `textChunks`, `reasoningChunks`, `toolCallChunks`, `fileChunks`, `errorChunk`, `finishChunk` |
| `tests/mocks/ai/helpers/streams.ts` | Stream builders: `textStream`, `reasoningStream`, `toolCallStream`, `fileStream`, `errorStream` |
| `tests/mocks/ai/helpers/models/claudeSonnet.ts` | Plain text response mock |
| `tests/mocks/ai/helpers/models/claudeSonnetVision.ts` | Multimodal mock (returns image + text) |
| `tests/mocks/ai/helpers/models/claudeSonnetWithTools.ts` | Two-step mock: tool call, then text |
| `tests/mocks/ai/helpers/models/deepseekV4Thinking.ts` | Reasoning chunks + text |
| `tests/mocks/ai/helpers/models/refusalModel.ts` | Refusal-text response |
| `tests/mocks/ai/helpers/models/errorModel.ts` | Mid-stream error |
| `tests/mocks/ai/registry.ts` | `MOCK_MODELS` object (auto-derives `MockModelId`) |
| `tests/mocks/ai/augmentation.d.ts` | Type augmentation for `LanguageModelKeys` |
| `tests/mocks/ai/index.ts` | Re-exports |
| `lib/features/foundation-model/available-models.ts` | `getAvailableModels()` abstraction |
| `tests/unit/mocks/ai/chunks.test.ts` | Vitest tests for chunk helpers |
| `tests/unit/mocks/ai/streams.test.ts` | Vitest tests for stream helpers |

### Files to modify

| Path | Change |
|------|--------|
| `lib/infrastructure/ai/providers.ts` | Replace generic mock with registry-based lookup; keep old behavior as fallback for modelIds not in registry (Phase 1 only) |
| `lib/features/chat/agents/utils.ts` | Remove `IS_TEST_ENV` hack from `withMessageProcessing` |
| `components/chat/provider.tsx` | Use `getAvailableModels()` instead of `CHAT_MODELS` directly |
| `tests/e2e/README.md` | Update to describe new architecture (in Phase 4) |

### Files to delete (Phase 4)

| Path | Reason |
|------|--------|
| `tests/mocks/ai.ts` | Replaced by the registry |

---

## Phase 1: Infrastructure

### Task 1: Create the mock types module

**Files:**
- Create: `tests/mocks/ai/types.ts`

- [ ] **Step 1: Create the types file**

Create `tests/mocks/ai/types.ts` with the following content:

```ts
import type { LanguageModelV3 } from "@ai-sdk/provider";

export interface MockCapabilities {
  multimodal?: boolean;
  toolExecution?: boolean;
  thinkingBlocks?: boolean;
  streamDelays?: boolean;
  errorScenarios?: Array<"refusal" | "rate_limit" | "timeout" | "mid_stream_error">;
}

export interface MockModelEntry {
  id: string;
  displayName: string;
  capabilities: MockCapabilities;
  languageModel: LanguageModelV3;
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/mocks/ai/types.ts
git commit -m "feat(mocks): add MockCapabilities and MockModelEntry types"
```

---

### Task 2: Create the chunks helper with TDD

**Files:**
- Create: `tests/mocks/ai/helpers/chunks.ts`
- Create: `tests/unit/mocks/ai/chunks.test.ts`
- Create: `tests/unit/mocks/ai/` directory (will be auto-created by vitest if missing — verify after first test run)

- [ ] **Step 1: Create the failing test**

Create `tests/unit/mocks/ai/chunks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  textChunks,
  reasoningChunks,
  toolCallChunks,
  fileChunks,
  errorChunk,
  finishChunk,
} from "@/tests/mocks/ai/helpers/chunks";

describe("textChunks", () => {
  it("produces start, delta, end sequence", () => {
    expect(textChunks("text-1", "hello")).toEqual([
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "hello" },
      { type: "text-end", id: "text-1" },
    ]);
  });
});

describe("reasoningChunks", () => {
  it("produces reasoning start, delta, end sequence", () => {
    expect(reasoningChunks("r-1", "thinking...")).toEqual([
      { type: "reasoning-start", id: "r-1" },
      { type: "reasoning-delta", id: "r-1", delta: "thinking..." },
      { type: "reasoning-end", id: "r-1" },
    ]);
  });
});

describe("toolCallChunks", () => {
  it("emits tool-input chunks followed by a tool-call chunk", () => {
    const chunks = toolCallChunks("call-1", "webSearch", { query: "x" });
    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toMatchObject({ type: "tool-input-start", toolName: "webSearch" });
    expect(chunks[1]).toMatchObject({ type: "tool-input-delta", delta: '{"query":"x"}' });
    expect(chunks[2]).toMatchObject({ type: "tool-input-end" });
    expect(chunks[3]).toMatchObject({ type: "tool-call", toolName: "webSearch" });
  });
});

describe("fileChunks", () => {
  it("emits a file chunk with the given mediaType and data", () => {
    expect(fileChunks("f-1", "image/png", "BASE64DATA")).toEqual([
      { type: "file", file: { mediaType: "image/png", data: "BASE64DATA" } },
    ]);
  });
});

describe("errorChunk", () => {
  it("emits an error chunk with the given error", () => {
    const err = new Error("boom");
    expect(errorChunk(err)).toEqual({ type: "error", error: err });
  });
});

describe("finishChunk", () => {
  it("emits a finish chunk with the given reason", () => {
    expect(finishChunk("stop")).toMatchObject({
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
    });
  });

  it("defaults to 'stop' reason", () => {
    expect(finishChunk()).toMatchObject({ finishReason: { unified: "stop" } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit tests/unit/mocks/ai/chunks.test.ts`
Expected: FAIL — module `@/tests/mocks/ai/helpers/chunks` not found.

- [ ] **Step 3: Implement the chunks helper**

Create `tests/mocks/ai/helpers/chunks.ts`:

```ts
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";

export const textChunks = (id: string, text: string): LanguageModelV3StreamPart[] => [
  { type: "text-start", id },
  { type: "text-delta", id, delta: text },
  { type: "text-end", id },
];

export const reasoningChunks = (id: string, text: string): LanguageModelV3StreamPart[] => [
  { type: "reasoning-start", id },
  { type: "reasoning-delta", id, delta: text },
  { type: "reasoning-end", id },
];

export const toolCallChunks = (
  id: string,
  toolName: string,
  args: unknown,
): LanguageModelV3StreamPart[] => {
  const input = JSON.stringify(args);
  return [
    { type: "tool-input-start", id, toolName },
    { type: "tool-input-delta", id, delta: input },
    { type: "tool-input-end", id },
    {
      type: "tool-call",
      toolCallId: id,
      toolName,
      input,
    },
  ];
};

export const fileChunks = (
  id: string,
  mediaType: string,
  data: string,
): LanguageModelV3StreamPart[] => [
  { type: "file", file: { mediaType, data } },
];

export const errorChunk = (error: unknown): LanguageModelV3StreamPart => ({
  type: "error",
  error,
});

export const finishChunk = (
  reason: "stop" | "tool-calls" | "length" | "error" | "other" = "stop",
): LanguageModelV3StreamPart => ({
  type: "finish",
  finishReason: { unified: reason, raw: reason },
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit tests/unit/mocks/ai/chunks.test.ts`
Expected: PASS — all 6 test groups green.

- [ ] **Step 5: Commit**

```bash
git add tests/mocks/ai/helpers/chunks.ts tests/unit/mocks/ai/chunks.test.ts
git commit -m "feat(mocks): add LanguageModelV3StreamPart chunk builders"
```

---

### Task 3: Create the streams helper with TDD

**Files:**
- Create: `tests/mocks/ai/helpers/streams.ts`
- Create: `tests/unit/mocks/ai/streams.test.ts`

- [ ] **Step 1: Create the failing test**

Create `tests/unit/mocks/ai/streams.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { convertReadableStreamToArray } from "ai/test";
import {
  textStream,
  reasoningStream,
  toolCallStream,
  fileStream,
  errorStream,
} from "@/tests/mocks/ai/helpers/streams";

describe("textStream", () => {
  it("emits a complete text response with finish", async () => {
    const result = textStream("hello world");
    const chunks = await convertReadableStreamToArray(result.stream);

    expect(chunks).toContainEqual({ type: "text-delta", id: "text-1", delta: "hello world" });
    expect(chunks.at(-1)).toMatchObject({ type: "finish", finishReason: { unified: "stop" } });
  });
});

describe("reasoningStream", () => {
  it("emits reasoning chunks followed by text", async () => {
    const result = reasoningStream("Let me think", "Answer: 42");
    const chunks = await convertReadableStreamToArray(result.stream);

    expect(chunks).toContainEqual({ type: "reasoning-delta", id: "reasoning-1", delta: "Let me think" });
    expect(chunks).toContainEqual({ type: "text-delta", id: "text-1", delta: "Answer: 42" });
  });
});

describe("toolCallStream", () => {
  it("emits a tool call and finishes with reason tool-calls", async () => {
    const result = toolCallStream("webSearch", { q: "x" });
    const chunks = await convertReadableStreamToArray(result.stream);

    const toolCall = chunks.find((c) => c.type === "tool-call");
    expect(toolCall).toMatchObject({ type: "tool-call", toolName: "webSearch" });

    const finish = chunks.find((c) => c.type === "finish");
    expect(finish).toMatchObject({ finishReason: { unified: "tool-calls" } });
  });
});

describe("fileStream", () => {
  it("emits a file chunk and a text chunk with finish", async () => {
    const result = fileStream("image/png", "BASE64DATA", "Description");
    const chunks = await convertReadableStreamToArray(result.stream);

    expect(chunks).toContainEqual({
      type: "file",
      file: { mediaType: "image/png", data: "BASE64DATA" },
    });
    expect(chunks).toContainEqual({ type: "text-delta", id: "text-1", delta: "Description" });
  });
});

describe("errorStream", () => {
  it("emits an error chunk and a finish chunk", async () => {
    const err = new Error("boom");
    const result = errorStream(err);
    const chunks = await convertReadableStreamToArray(result.stream);

    expect(chunks).toContainEqual({ type: "error", error: err });
    expect(chunks.at(-1)).toMatchObject({ type: "finish" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit tests/unit/mocks/ai/streams.test.ts`
Expected: FAIL — module `@/tests/mocks/ai/helpers/streams` not found.

- [ ] **Step 3: Implement the streams helper**

Create `tests/mocks/ai/helpers/streams.ts`:

```ts
import { simulateReadableStream } from "ai";
import type { LanguageModelV3StreamResult } from "@ai-sdk/provider";
import {
  textChunks,
  reasoningChunks,
  toolCallChunks,
  fileChunks,
  errorChunk,
  finishChunk,
} from "./chunks";

export const textStream = (text: string): LanguageModelV3StreamResult => ({
  stream: simulateReadableStream({
    chunks: [...textChunks("text-1", text), finishChunk("stop")],
    chunkDelayInMs: null,
  }),
});

export const reasoningStream = (
  reasoning: string,
  text: string,
): LanguageModelV3StreamResult => ({
  stream: simulateReadableStream({
    chunks: [
      ...reasoningChunks("reasoning-1", reasoning),
      ...textChunks("text-1", text),
      finishChunk("stop"),
    ],
    chunkDelayInMs: null,
  }),
});

export const toolCallStream = (
  toolName: string,
  args: unknown,
): LanguageModelV3StreamResult => ({
  stream: simulateReadableStream({
    chunks: [...toolCallChunks("call-1", toolName, args), finishChunk("tool-calls")],
    chunkDelayInMs: null,
  }),
});

export const fileStream = (
  mediaType: string,
  data: string,
  text: string,
): LanguageModelV3StreamResult => ({
  stream: simulateReadableStream({
    chunks: [...fileChunks("file-1", mediaType, data), ...textChunks("text-1", text), finishChunk("stop")],
    chunkDelayInMs: null,
  }),
});

export const errorStream = (error: unknown): LanguageModelV3StreamResult => ({
  stream: simulateReadableStream({
    chunks: [errorChunk(error), finishChunk("error")],
    chunkDelayInMs: null,
  }),
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit tests/unit/mocks/ai/streams.test.ts`
Expected: PASS — all 5 test groups green.

- [ ] **Step 5: Commit**

```bash
git add tests/mocks/ai/helpers/streams.ts tests/unit/mocks/ai/streams.test.ts
git commit -m "feat(mocks): add LanguageModelV3StreamResult stream builders"
```

---

### Task 4: Create the first mock (claudeSonnet)

**Files:**
- Create: `tests/mocks/ai/helpers/models/claudeSonnet.ts`

- [ ] **Step 1: Create the mock file**

Create `tests/mocks/ai/helpers/models/claudeSonnet.ts`:

```ts
import { MockLanguageModelV3 } from "ai/test";
import { textStream } from "../streams";
import type { MockModelEntry } from "../../types";

const model = new MockLanguageModelV3({
  modelId: "claudeSonnet",
  doStream: async () => textStream("Hello from Claude Sonnet (mock)"),
  doGenerate: async () => ({
    content: [{ type: "text", text: "Hello from Claude Sonnet (mock)" }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    warnings: [],
  }),
});

export const MOCK_CLAUDE_SONNET: MockModelEntry = {
  id: "claudeSonnet",
  displayName: "Claude Sonnet",
  capabilities: {},
  languageModel: model,
};
```

- [ ] **Step 2: Commit**

```bash
git add tests/mocks/ai/helpers/models/claudeSonnet.ts
git commit -m "feat(mocks): add claudeSonnet text-response mock"
```

---

### Task 5: Create the registry

**Files:**
- Create: `tests/mocks/ai/registry.ts`

- [ ] **Step 1: Create the registry file**

Create `tests/mocks/ai/registry.ts`:

```ts
import type { MockModelEntry } from "./types";
import { MOCK_CLAUDE_SONNET } from "./helpers/models/claudeSonnet";

export const MOCK_MODELS = {
  claudeSonnet: MOCK_CLAUDE_SONNET,
} as const satisfies Record<string, MockModelEntry>;

export type MockModelId = keyof typeof MOCK_MODELS;
```

- [ ] **Step 2: Verify the type derivation with tsc**

Run: `npx tsc --noEmit`
Expected: PASS — `MockModelId` resolves to `"claudeSonnet"`.

- [ ] **Step 3: Commit**

```bash
git add tests/mocks/ai/registry.ts
git commit -m "feat(mocks): add MOCK_MODELS registry with auto-derived MockModelId"
```

---

### Task 6: Create the type augmentation

**Files:**
- Create: `tests/mocks/ai/augmentation.d.ts`

- [ ] **Step 1: Create the augmentation file**

Create `tests/mocks/ai/augmentation.d.ts`:

```ts
import type { ModelConfiguration } from "@/lib/features/foundation-model/types";
import type { MOCK_MODELS } from "./registry";

type MockConfigKeys = keyof typeof MOCK_MODELS;

declare module "@/lib/features/foundation-model/config" {
  export const LANGUAGE_MODEL_CONFIGURATIONS_CONST:
    (typeof import("@/lib/features/foundation-model/config").LANGUAGE_MODEL_CONFIGURATIONS_CONST)
    & Record<MockConfigKeys, ModelConfiguration>;
}
```

- [ ] **Step 2: Verify tsc accepts the augmentation**

Run: `npx tsc --noEmit`
Expected: PASS. The augmentation only adds type info; the runtime value is not yet populated (a future task will populate it in the providers layer, see Task 8).

- [ ] **Step 3: Commit**

```bash
git add tests/mocks/ai/augmentation.d.ts
git commit -m "feat(mocks): add type augmentation for LanguageModelKeys"
```

---

### Task 7: Create getAvailableModels()

**Files:**
- Create: `lib/features/foundation-model/available-models.ts`

- [ ] **Step 1: Create the file**

Create `lib/features/foundation-model/available-models.ts`:

```ts
import { CHAT_MODELS } from "./config";
import { isTestMode } from "@/lib/infrastructure/env";
import { MOCK_MODELS } from "@/tests/mocks/ai";

export interface AvailableModel {
  id: string;
  displayName: string;
}

export const getAvailableModels = (): readonly AvailableModel[] => {
  if (isTestMode()) {
    return Object.values(MOCK_MODELS).map((m) => ({
      id: m.id,
      displayName: m.displayName,
    }));
  }
  return CHAT_MODELS.map((id) => ({ id, displayName: id }));
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/foundation-model/available-models.ts
git commit -m "feat(foundation): add getAvailableModels() that swaps mocks in test mode"
```

---

### Task 8: Update the chat provider to use getAvailableModels()

**Files:**
- Modify: `components/chat/provider.tsx:5-10` and `components/chat/provider.tsx:53`

- [ ] **Step 1: Update the import**

In `components/chat/provider.tsx`, replace the imports from `@/lib/features/foundation-model/config` (lines 4-10) with:

```tsx
import { getAvailableModels } from "@/lib/features/foundation-model/available-models";
import {
  defaultModel,
  defaultRagMaxResources,
  defaultMinRagScore,
  defaultWebSearchNumResults,
} from "@/lib/features/foundation-model/config";
```

- [ ] **Step 2: Update the context default value**

In `components/chat/provider.tsx`, line 53, change:

```tsx
  availableModels: CHAT_MODELS,
```

to:

```tsx
  availableModels: getAvailableModels(),
```

- [ ] **Step 3: Verify tsc and the dev server**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `pnpm dev` (in another shell), visit `http://localhost:3000`. The model picker should still show real models. (In production mode, `isTestMode()` returns `false` and the behavior is unchanged.)

- [ ] **Step 4: Verify e2e tests still pass**

Run: `pnpm test:e2e`
Expected: PASS — all existing e2e tests should pass because `NEXT_PUBLIC_ENV=test` is set and `isTestMode()` returns `true`, so the picker will now show mock entries (only `claudeSonnet` so far). Existing tests that select real models via the picker may fail because those real models are no longer in the picker.

**If tests fail because the picker no longer shows real model names:** the tests are selecting real models like "Gemini 3 Flash" which don't exist in the new test picker. This is expected — the next task (Task 9) adds the fallback in `providers.ts` so that real model IDs not in the registry still work via the old generic mock.

- [ ] **Step 5: Commit**

```bash
git add components/chat/provider.tsx
git commit -m "feat(chat): use getAvailableModels() in chat provider context"
```

---

### Task 9: Update providers.ts to use the registry with fallback

**Files:**
- Modify: `lib/infrastructure/ai/providers.ts:14` and `lib/infrastructure/ai/providers.ts:41-58`

- [ ] **Step 1: Read the current providers.ts to understand the structure**

Read `lib/infrastructure/ai/providers.ts` to see the current `createMockModel` import and the test-mode branch.

- [ ] **Step 2: Update the import**

In `lib/infrastructure/ai/providers.ts`, replace the import on line 14:

```ts
import { createMockEmbeddingModel, createMockModel } from "@/tests/mocks/ai";
```

with:

```ts
import { createMockEmbeddingModel, createMockModel } from "@/tests/mocks/ai";
import { MOCK_MODELS } from "@/tests/mocks/ai/registry";
import type { MockModelId } from "@/tests/mocks/ai/registry";
```

- [ ] **Step 3: Update the test-mode branch to use the registry with fallback**

Replace the current test-mode branch (lines 41-58) with:

```ts
// Test mode: prefer registry mocks, fall back to the old generic mock
// for any modelId not in the registry. This is the Phase 1 transitional
// behavior — Phase 4 will remove the fallback.
const lookupMock = (modelId: string) => {
  if (modelId in MOCK_MODELS) {
    return MOCK_MODELS[modelId as MockModelId].languageModel;
  }
  return createMockModel(modelId);
};

return {
  anthropic: lookupMock,
  openai: lookupMock,
  google: lookupMock,
  xai: lookupMock,
  groq: lookupMock,
  deepseek: lookupMock,
  perplexity: lookupMock,
  gateway: lookupMock,
  openrouter: lookupMock,
  deepinfra: lookupMock,
  lmstudio: lookupMock,
  opencodeGo: lookupMock,
  embedding: () => createMockEmbeddingModel(),
  rerank: () => async () => [],
};
```

**Note:** Only the test-mode branch is being changed. The non-test branch above it (the real providers like `anthropic`, `openai`, etc.) stays exactly as it is.

- [ ] **Step 4: Verify tsc**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify all e2e tests pass**

Run: `pnpm test:e2e`
Expected: PASS — all existing e2e tests continue to pass because the fallback in `lookupMock` returns the old generic mock for any modelId not in the registry.

- [ ] **Step 6: Commit**

```bash
git add lib/infrastructure/ai/providers.ts
git commit -m "feat(providers): route to mock registry in test mode with generic fallback"
```

---

### Task 10: Remove the activeTools hack from withMessageProcessing

**Files:**
- Modify: `lib/features/chat/agents/utils.ts:9,23,32-52`

- [ ] **Step 1: Read the current utils.ts**

Read `lib/features/chat/agents/utils.ts` to understand the current implementation. The relevant lines are 9 (import), 23 (`IS_TEST_ENV` constant), and 32-52 (`withMessageProcessing` body).

- [ ] **Step 2: Remove the import**

Remove line 9:

```ts
import { isTestMode } from "@/lib/infrastructure/env";
```

- [ ] **Step 3: Remove the IS_TEST_ENV constant**

Remove lines 22-23:

```ts
export const IS_TEST_ENV = isTestMode();
```

(including the trailing blank line if it becomes redundant)

- [ ] **Step 4: Remove the hack from withMessageProcessing**

In the `withMessageProcessing` function body, remove lines 37-39:

```ts
    if (IS_TEST_ENV) {
      return { activeTools: [] };
    }
```

The function should now start with `const innerResult = await innerPrepareStep?.(context);`.

- [ ] **Step 5: Verify tsc**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Verify all e2e tests pass**

Run: `pnpm test:e2e`
Expected: PASS — existing e2e tests don't exercise tool execution, so removing the hack should be safe. (Any test that does break is testing a flow that the new mocks can model better — file an issue and migrate in Phase 3.)

- [ ] **Step 7: Commit**

```bash
git add lib/features/chat/agents/utils.ts
git commit -m "refactor(agents): remove IS_TEST_ENV activeTools hack, let mocks drive tool use"
```

---

### Task 11: Add the remaining mocks

**Files:**
- Create: `tests/mocks/ai/helpers/models/claudeSonnetVision.ts`
- Create: `tests/mocks/ai/helpers/models/claudeSonnetWithTools.ts`
- Create: `tests/mocks/ai/helpers/models/deepseekV4Thinking.ts`
- Create: `tests/mocks/ai/helpers/models/refusalModel.ts`
- Create: `tests/mocks/ai/helpers/models/errorModel.ts`
- Modify: `tests/mocks/ai/registry.ts` (add 5 entries)

- [ ] **Step 1: Create claudeSonnetVision**

Create `tests/mocks/ai/helpers/models/claudeSonnetVision.ts`:

```ts
import { MockLanguageModelV3 } from "ai/test";
import { fileStream } from "../streams";
import type { MockModelEntry } from "../../types";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const model = new MockLanguageModelV3({
  modelId: "claudeSonnetVision",
  doStream: async () => fileStream("image/png", PNG_BASE64, "Image description (mock)"),
  doGenerate: async () => ({
    content: [
      { type: "file", mediaType: "image/png", data: PNG_BASE64 },
      { type: "text", text: "Image description (mock)" },
    ],
    finishReason: { unified: "stop", raw: "stop" },
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    warnings: [],
  }),
});

export const MOCK_CLAUDE_SONNET_VISION: MockModelEntry = {
  id: "claudeSonnetVision",
  displayName: "Claude Sonnet (Vision)",
  capabilities: { multimodal: true },
  languageModel: model,
};
```

- [ ] **Step 2: Create claudeSonnetWithTools**

Create `tests/mocks/ai/helpers/models/claudeSonnetWithTools.ts`:

```ts
import { MockLanguageModelV3 } from "ai/test";
import { simulateReadableStream } from "ai";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { toolCallChunks, textChunks, finishChunk } from "../chunks";
import { textStream } from "../streams";
import type { MockModelEntry } from "../../types";

const FIRST_STEP_CHUNKS: LanguageModelV3StreamPart[] = [
  ...toolCallChunks("call-1", "webSearch", { query: "test query" }),
  finishChunk("tool-calls"),
];

const model = new MockLanguageModelV3({
  modelId: "claudeSonnetWithTools",
  doStream: [
    { stream: simulateReadableStream({ chunks: FIRST_STEP_CHUNKS, chunkDelayInMs: null }) },
    textStream("Based on the search results, here is the answer (mock)."),
  ],
  doGenerate: async () => ({
    content: [{ type: "text", text: "Based on the search results, here is the answer (mock)." }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    warnings: [],
  }),
});

export const MOCK_CLAUDE_SONNET_WITH_TOOLS: MockModelEntry = {
  id: "claudeSonnetWithTools",
  displayName: "Claude Sonnet (With Tools)",
  capabilities: { toolExecution: true },
  languageModel: model,
};
```

- [ ] **Step 3: Create deepseekV4Thinking**

Create `tests/mocks/ai/helpers/models/deepseekV4Thinking.ts`:

```ts
import { MockLanguageModelV3 } from "ai/test";
import { reasoningStream } from "../streams";
import type { MockModelEntry } from "../../types";

const model = new MockLanguageModelV3({
  modelId: "deepseekV4Thinking",
  doStream: async () => reasoningStream("Let me think about this...", "The answer is 42."),
  doGenerate: async () => ({
    content: [
      { type: "reasoning", text: "Let me think about this..." },
      { type: "text", text: "The answer is 42." },
    ],
    finishReason: { unified: "stop", raw: "stop" },
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    warnings: [],
  }),
});

export const MOCK_DEEPSEEK_V4_THINKING: MockModelEntry = {
  id: "deepseekV4Thinking",
  displayName: "Deepseek V4 (Thinking)",
  capabilities: { thinkingBlocks: true },
  languageModel: model,
};
```

- [ ] **Step 4: Create refusalModel**

Create `tests/mocks/ai/helpers/models/refusalModel.ts`:

```ts
import { MockLanguageModelV3 } from "ai/test";
import { textStream } from "../streams";
import type { MockModelEntry } from "../../types";

const model = new MockLanguageModelV3({
  modelId: "refusalModel",
  doStream: async () => textStream("I cannot help with that request."),
  doGenerate: async () => ({
    content: [{ type: "text", text: "I cannot help with that request." }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    warnings: [],
  }),
});

export const MOCK_REFUSAL: MockModelEntry = {
  id: "refusalModel",
  displayName: "Refusal Model",
  capabilities: { errorScenarios: ["refusal"] },
  languageModel: model,
};
```

- [ ] **Step 5: Create errorModel**

Create `tests/mocks/ai/helpers/models/errorModel.ts`:

```ts
import { MockLanguageModelV3 } from "ai/test";
import { errorStream } from "../streams";
import type { MockModelEntry } from "../../types";

const model = new MockLanguageModelV3({
  modelId: "errorModel",
  doStream: async () => errorStream(new Error("Mock mid-stream error")),
  doGenerate: async () => {
    throw new Error("Mock doGenerate error");
  },
});

export const MOCK_ERROR: MockModelEntry = {
  id: "errorModel",
  displayName: "Error Model",
  capabilities: { errorScenarios: ["mid_stream_error"] },
  languageModel: model,
};
```

- [ ] **Step 6: Update the registry to include all mocks**

Update `tests/mocks/ai/registry.ts`:

```ts
import type { MockModelEntry } from "./types";
import { MOCK_CLAUDE_SONNET } from "./helpers/models/claudeSonnet";
import { MOCK_CLAUDE_SONNET_VISION } from "./helpers/models/claudeSonnetVision";
import { MOCK_CLAUDE_SONNET_WITH_TOOLS } from "./helpers/models/claudeSonnetWithTools";
import { MOCK_DEEPSEEK_V4_THINKING } from "./helpers/models/deepseekV4Thinking";
import { MOCK_REFUSAL } from "./helpers/models/refusalModel";
import { MOCK_ERROR } from "./helpers/models/errorModel";

export const MOCK_MODELS = {
  claudeSonnet: MOCK_CLAUDE_SONNET,
  claudeSonnetVision: MOCK_CLAUDE_SONNET_VISION,
  claudeSonnetWithTools: MOCK_CLAUDE_SONNET_WITH_TOOLS,
  deepseekV4Thinking: MOCK_DEEPSEEK_V4_THINKING,
  refusalModel: MOCK_REFUSAL,
  errorModel: MOCK_ERROR,
} as const satisfies Record<string, MockModelEntry>;

export type MockModelId = keyof typeof MOCK_MODELS;
```

- [ ] **Step 7: Create the index.ts re-export module**

Create `tests/mocks/ai/index.ts`:

```ts
export { MOCK_MODELS } from "./registry";
export type { MockModelId } from "./registry";
export type { MockModelEntry, MockCapabilities } from "./types";
```

- [ ] **Step 8: Verify tsc and e2e tests**

Run: `npx tsc --noEmit && pnpm test:e2e`
Expected: tsc PASS, all e2e tests PASS (none of them select a mock by display name yet — they all use the fallback).

- [ ] **Step 9: Commit**

```bash
git add tests/mocks/ai/
git commit -m "feat(mocks): add vision, tool-execution, thinking, refusal, error mocks"
```

---

## Phase 2: Migrate existing tests

**Trigger to start Phase 2:** Phase 1 complete. All e2e tests pass. The picker now shows six mock entries in test mode.

**Strategy:** for each test, identify the model it selects via the picker. If a matching mock exists in the registry, update the test to use the mock explicitly and update assertions to be behavior-focused. If no matching mock exists, keep the test using the generic fallback (or add a new mock if needed).

### Task 12: Migrate seed.spec.ts

**Files:**
- Modify: `tests/e2e/seed.spec.ts`

- [ ] **Step 1: Read the current seed.spec.ts**

- [ ] **Step 2: Update model selection to use a mock**

Change `selectModel("Gemini 3 Flash")` to `selectModel("Claude Sonnet")`.

- [ ] **Step 3: Update assertions**

Change `expect(lastMessage).toContain("gemini")` to `expect(lastMessage).toContain("Hello from Claude Sonnet")`.

- [ ] **Step 4: Verify the test passes**

Run: `pnpm test:e2e tests/e2e/seed.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/seed.spec.ts
git commit -m "test(seed): migrate to claudeSonnet mock from registry"
```

---

### Tasks 13-22: Migrate the remaining e2e tests

**Pattern (repeated for each test file):**

For each of these test files:
- `tests/e2e/chat/attachments.spec.ts`
- `tests/e2e/chat/history.spec.ts`
- `tests/e2e/chat/hub-sidebar-update.spec.ts`
- `tests/e2e/chat/hub.spec.ts`
- `tests/e2e/chat/navigation.spec.ts`
- `tests/e2e/chat/refine.spec.ts`
- `tests/e2e/chat/settings.spec.ts`
- `tests/e2e/chat/sidebar.spec.ts`
- `tests/e2e/chat/projects/management.spec.ts`
- `tests/e2e/chat/projects/creation.spec.ts`
- `tests/e2e/chat/projects/chat.spec.ts`

For each test:
- [ ] **Step 1: Read the test file**
- [ ] **Step 2: Identify the model selected via the picker**
- [ ] **Step 3: Update the picker selection to a mock that exists in the registry (e.g., "Claude Sonnet")**
- [ ] **Step 4: Update any `toContain("modelName")` assertions to behavior-focused assertions (e.g., `toContain("Hello from Claude Sonnet")`)**
- [ ] **Step 5: Run the test and verify it passes**
- [ ] **Step 6: Commit** with a message like `test(<name>): migrate to <mock> from registry`

**Note:** If a test asserts on model-specific output that doesn't match the new mock's output, update the assertion to match the new mock's output. If the assertion was checking for a bug or edge case in the model selection, document why the new mock doesn't replicate that behavior.

**When to break this pattern:**
- If a test specifically exercises the real model selection UI in production, leave it as-is (it should still work because the test uses the picker, and the picker shows mocks in test mode).
- If a test would need a brand-new mock to model its behavior, either add the mock to the catalog (in a separate task) or keep the test on the generic fallback.

---

## Phase 3: New capabilities

**Trigger to start Phase 3:** Phase 2 complete (all e2e tests are using mocks from the registry, no tests use the generic fallback).

### Task 23: Add a tool execution test

**Files:**
- Create: `tests/e2e/chat/tool-execution.spec.ts`

- [ ] **Step 1: Write the test**

Create `tests/e2e/chat/tool-execution.spec.ts`:

```ts
import { test, expect } from "./fixtures";
import { ChatPage } from "./pages/chat";

test.describe("Tool execution flow", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    await chatPage.header.modelPicker.selectModel("Claude Sonnet (With Tools)");
  });

  test("model calls webSearch and continues with text response", async () => {
    await chatPage.chat.sendMessage("What is the weather?");
    await chatPage.chat.waitForLoadingComplete();

    const lastMessage = await chatPage.chat.getLastAssistantMessage();
    expect.soft(lastMessage).toContain("Based on the search results");
  });
});
```

- [ ] **Step 2: Run the test and verify it passes**

Run: `pnpm test:e2e tests/e2e/chat/tool-execution.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/chat/tool-execution.spec.ts
git commit -m "test(tool-execution): add e2e test using claudeSonnetWithTools mock"
```

---

### Task 24: Add a multimodal test

**Files:**
- Create: `tests/e2e/chat/multimodal.spec.ts`

- [ ] **Step 1: Write the test**

Create `tests/e2e/chat/multimodal.spec.ts`:

```ts
import { test, expect } from "./fixtures";
import { ChatPage } from "./pages/chat";

test.describe("Multimodal flow", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    await chatPage.header.modelPicker.selectModel("Claude Sonnet (Vision)");
  });

  test("model returns an image and text description", async () => {
    await chatPage.chat.sendMessage("Describe this image");
    await chatPage.chat.waitForLoadingComplete();

    const lastMessage = await chatPage.chat.getLastAssistantMessage();
    expect.soft(lastMessage).toContain("Image description (mock)");
    // Add an assertion for the image element if the UI surfaces it
  });
});
```

- [ ] **Step 2: Run the test and verify it passes**

Run: `pnpm test:e2e tests/e2e/chat/multimodal.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/chat/multimodal.spec.ts
git commit -m "test(multimodal): add e2e test using claudeSonnetVision mock"
```

---

### Tasks 25-26: Add error and thinking-block tests

Repeat the pattern from Tasks 23-24 for:
- `refusalModel` — test that the UI handles refusal text gracefully
- `errorModel` — test that the UI handles mid-stream errors
- `deepseekV4Thinking` — test that reasoning blocks are displayed

Each is one task with the same 3 steps (write test, run, commit).

---

## Phase 4: Cleanup

**Trigger to start Phase 4:** all e2e tests are using mocks from the registry, no test relies on the generic fallback.

**Verification commands:**
- `pnpm test:e2e` — must be green
- `grep -r "selectModel(" tests/e2e/ | grep -v "claudeSonnet\|deepseekV4\|refusalModel\|errorModel"` — must return zero results (all test picker selections use a mock from the registry)

### Task 27: Remove the generic fallback from providers.ts

**Files:**
- Modify: `lib/infrastructure/ai/providers.ts`

- [ ] **Step 1: Update lookupMock to throw for unknown IDs**

Replace the `lookupMock` function in `lib/infrastructure/ai/providers.ts`:

```ts
  const lookupMock = (modelId: string) => {
    if (modelId in MOCK_MODELS) {
      return MOCK_MODELS[modelId as MockModelId].languageModel;
    }
    throw new Error(
      `No mock registered for modelId "${modelId}". Available mocks: ${Object.keys(MOCK_MODELS).join(", ")}`,
    );
  };
```

- [ ] **Step 2: Remove the unused import of createMockModel**

If `createMockModel` is no longer used in `providers.ts`, remove the import:

```ts
import { createMockEmbeddingModel, createMockModel } from "@/tests/mocks/ai";
```

Replace with:

```ts
import { createMockEmbeddingModel } from "@/tests/mocks/ai";
```

(If `createMockModel` is still used elsewhere in the file, leave the import.)

- [ ] **Step 3: Verify tsc and e2e tests pass**

Run: `npx tsc --noEmit && pnpm test:e2e`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/infrastructure/ai/providers.ts
git commit -m "refactor(providers): throw for unknown mock IDs in test mode (strict)"
```

---

### Task 28: Delete the old mock file

**Files:**
- Delete: `tests/mocks/ai.ts`

- [ ] **Step 1: Verify nothing imports from `@/tests/mocks/ai` (the file, not the directory)**

Run: `grep -r "from '@/tests/mocks/ai'" --include="*.ts" --include="*.tsx" .`
Expected: only the new `tests/mocks/ai/` directory imports. No imports from the bare `tests/mocks/ai.ts` file.

- [ ] **Step 2: Delete the old file**

```bash
rm tests/mocks/ai.ts
```

- [ ] **Step 3: Verify tsc and e2e tests pass**

Run: `npx tsc --noEmit && pnpm test:e2e`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -u tests/mocks/ai.ts
git commit -m "chore: remove legacy content-driven mock (replaced by registry)"
```

---

### Task 29: Update tests/e2e/README.md

**Files:**
- Modify: `tests/e2e/README.md`

- [ ] **Step 1: Replace stale fixture documentation**

The current README references `setProviders` and `setDb` fixtures that don't exist. Rewrite the README to document:
- The mock registry in `tests/mocks/ai/`
- How to select a mock in a test (via the model picker)
- The initial catalog of mocks
- How to add a new mock

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/README.md
git commit -m "docs(e2e): update README to describe the mock registry architecture"
```

---

## Self-Review Checklist

After completing each task, verify:
- [ ] `pnpm lint:fix` runs clean
- [ ] `npx tsc --noEmit` passes
- [ ] `pnpm test:unit` (helper tests) passes
- [ ] `pnpm test:e2e` passes
- [ ] The commit message follows the repo's commit message conventions

At the end of each phase:
- [ ] Phase 1: 11 commits land, all e2e tests still pass
- [ ] Phase 2: 11 commits land, all e2e tests pass with explicit mock selection
- [ ] Phase 3: New tests added, all e2e tests pass
- [ ] Phase 4: Old mock file deleted, strict mode enforced, README updated
