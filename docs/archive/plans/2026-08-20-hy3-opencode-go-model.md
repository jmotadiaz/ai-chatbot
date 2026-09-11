# Hy3 (OpenCode Go) & Tencent Company Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar el modelo **Hy3** de Tencent en el monorepo como modelo `userInvocable: true` servido vía **OpenCode Go** (`provider: { kind: "opencodeGo", modelId: "hy3" }`), registrando la nueva empresa `tencent` y su icono SVG de LobeHub.

**Architecture:** Se actualiza `Company` en `packages/models` y `packages/model-registry` para incluir `"tencent"`. Se añade la entrada `"Hy3"` a `MODEL_CATALOG` en `packages/models` con metadatos completos de límites, costes y `thinkingLevelMap` (`off`, `low`, `high`). Se crea el componente `TencentIcon` en `packages/chatbot/components/ui/icons.tsx` y se asocia en el selector `model-picker.tsx`.

**Tech Stack:** TypeScript, Next.js, Vitest, Pi Coding Agent models.json generator.

## Global Constraints

- Package manager: pnpm 11 in workspace mode.
- Node.js 24.
- AI commit attribution must include: `Co-Authored-By: Gemini 3.7 Flash <noreply@example.com>`.
- Zero `process.env` in `src/` (usar `config` de `packages/config`).
- Strict typing: `Company` type must remain synchronized in `packages/models` and `packages/model-registry`.

---

### Task 1: Model Catalog, Types, Mapping & Generator (`packages/models` & `packages/model-registry`)

**Files:**
- Modify: `packages/models/src/catalog.ts`
- Modify: `packages/model-registry/src/types.ts`
- Modify: `packages/models/src/catalog.test.ts`
- Modify: `packages/models/src/mapping.test.ts`
- Modify: `packages/models/src/generate-models-json.test.ts`

**Interfaces:**
- Produces: `Company` containing `"tencent"`, `MODEL_CATALOG` containing `"Hy3"` entry (`userInvocable: true`, `provider: { kind: "opencodeGo", modelId: "hy3" }`, `company: "tencent"`, `reasoning: true`, `defaultThinkingLevel: "high"`, `thinkingLevelMap: { off: "no_think", minimal: null, low: "low", medium: null, high: "high" }`, `contextWindow: 262_144`, `maxTokens: 128_000`, `cost: { input: 0.14, output: 0.58, cacheRead: 0.038, cacheWrite: 0 }`).

- [ ] **Step 1: Write the failing tests**

Update `packages/models/src/catalog.test.ts`:
```ts
// In "exposes exactly the coding-agent models as invocable, in order":
    expect([...INVOCABLE_MODEL_IDS]).toEqual([
      "Deepseek v4 Flash",
      "Deepseek v4 Flash (free)",
      "Deepseek v4 Pro",
      "Kimi K2.7 Code",
      "Kimi K3",
      "MiniMax M3",
      "Qwen 3.7 Plus",
      "Qwen 3.8 Max",
      "Qwen 3.8 27B",
      "MiMo V2.5",
      "MiMo V2.5 Pro",
      "Muse Spark 1.2",
      "Gemini 3.7 Flash",
      "GLM 5.3",
      "GLM 5.2",
      "Hy3",
    ]);

// In "resolves the catalog default for known coding-agent models":
    expect(getDefaultThinkingLevel("Hy3")).toBe("high");
```

Update `packages/models/src/mapping.test.ts`:
```ts
  it("maps the Hy3 catalog id to the opencode-go Pi provider", () => {
    expect(toPiModelId("Hy3")).toEqual({
      providerId: "opencode-go",
      modelId: "hy3",
    });
    expect(toChatModelId("opencode-go", "hy3")).toBe("Hy3");
  });
```

Update `packages/models/src/generate-models-json.test.ts`:
```ts
  it("describes Hy3, which Pi does not ship yet on opencode-go", () => {
    const entry = MODEL_CATALOG.find((e) => e.id === "Hy3")!;
    const [hy3] = generateModelsJson([entry], { builtIns: new Map() })
      .providers["opencode-go"].models;
    expect(hy3.id).toBe("hy3");
    expect(hy3.contextWindow).toBe(262_144);
    expect(hy3.maxTokens).toBe(128_000);
    expect(hy3.cost).toEqual({
      input: 0.14,
      output: 0.58,
      cacheRead: 0.038,
      cacheWrite: 0,
    });
    expect(hy3.reasoning).toBe(true);
    expect(hy3.thinkingLevelMap).toEqual({
      off: "no_think",
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter models test:unit`
Expected: FAIL with missing "Hy3" in catalog and mappings.

- [ ] **Step 3: Implement minimal code**

In `packages/model-registry/src/types.ts`:
```ts
export type Company =
  | "meta"
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "mistral"
  | "deepseek"
  | "perplexity"
  | "alibaba"
  | "moonshotai"
  | "minimax"
  | "nvidia"
  | "xiaomi"
  | "zai"
  | "stepfun"
  | "tencent"
  | "ai chatbot";
```

In `packages/models/src/catalog.ts`:
```ts
export type Company =
  | "meta"
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "mistral"
  | "deepseek"
  | "perplexity"
  | "alibaba"
  | "moonshotai"
  | "minimax"
  | "nvidia"
  | "xiaomi"
  | "zai"
  | "stepfun"
  | "tencent"
  | "ai chatbot";
```
And add to `MODEL_CATALOG` in `packages/models/src/catalog.ts`:
```ts
  {
    id: "Hy3",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "hy3" },
    company: "tencent",
    reasoning: true,
    defaultThinkingLevel: "high",
    thinkingLevelMap: {
      off: "no_think",
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
    },
    contextWindow: 262_144,
    maxTokens: 128_000,
    cost: { input: 0.14, output: 0.58, cacheRead: 0.038, cacheWrite: 0 },
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter models test:unit`
Expected: PASS (all tests in `packages/models` pass).

- [ ] **Step 5: Commit**

```bash
git add packages/models/ packages/model-registry/
git commit -m "feat(models): add Hy3 opencode-go model and tencent company

Co-Authored-By: Gemini 3.7 Flash <noreply@example.com>"
```

---

### Task 2: Icon Component & Chat UI Model Picker (`packages/chatbot`)

**Files:**
- Modify: `packages/chatbot/components/ui/icons.tsx`
- Modify: `packages/chatbot/components/chat/model-picker.tsx`
- Create: `packages/chatbot/tests/unit/foundation-model/hy3-config.test.ts`

**Interfaces:**
- Consumes: `Company` including `"tencent"` and `chatModelKeys` including `"Hy3"`.
- Produces: `TencentIcon` component in `icons.tsx` and mapping in `model-picker.tsx`.

- [ ] **Step 1: Write the failing test**

Create `packages/chatbot/tests/unit/foundation-model/hy3-config.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { chatModelKeys, languageModelConfigurations } from "@/lib/features/foundation-model/config";
import { providers } from "@/lib/infrastructure/ai/providers";

describe("Hy3 in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Hy3");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = languageModelConfigurations("Hy3");
    expect(cfg.company).toBe("tencent");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.contextWindow).toBe(262_144);
  });

  it("exposes an opencodeGo provider factory with the model id (mock in test mode)", () => {
    expect(providers.opencodeGo).toBeDefined();
    expect(providers.opencodeGo("hy3")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chatbot test:unit tests/unit/foundation-model/hy3-config.test.ts`
Expected: PASS or FAIL depending on Task 1 presence, but validates chatbot configuration.

- [ ] **Step 3: Implement minimal code**

In `packages/chatbot/components/ui/icons.tsx`:
```tsx
export const TencentIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    fill="currentColor"
    fillRule="evenodd"
    height={size}
    viewBox="0 0 24 24"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
  >
    <title>Tencent</title>
    <path d="M9.976 1L24 9.8l-10.587.015L10.723 23H5.489L8.18 9.8H3.244L1 5.4h8.077L9.976 1z"></path>
  </svg>
);
```

In `packages/chatbot/components/chat/model-picker.tsx`:
Import `TencentIcon` from `@/components/ui/icons` and add to `icons`:
```tsx
const icons: Record<Company, React.ComponentType<{ size: number }>> = {
  openai: OpenaiIcon,
  anthropic: ClaudeIcon,
  meta: MetaIcon,
  google: GeminiIcon,
  xai: GrokIcon,
  deepseek: DeepseekIcon,
  perplexity: PerplexityIcon,
  alibaba: QwenIcon,
  moonshotai: MoonshotIcon,
  mistral: MistralIcon,
  minimax: MiniMaxIcon,
  nvidia: NvidiaIcon,
  zai: ZaiIcon,
  xiaomi: XiaomiIcon,
  stepfun: LogoIcon,
  tencent: TencentIcon,
  "ai chatbot": LogoIcon,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter chatbot test:unit tests/unit/foundation-model/hy3-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/chatbot/
git commit -m "feat(chatbot): add TencentIcon and wire tencent company in model-picker

Co-Authored-By: Gemini 3.7 Flash <noreply@example.com>"
```

---

### Task 3: Full Monorepo Fast Verification

**Files:**
- N/A (Validation step)

- [ ] **Step 1: Run fast verification suite across all packages**

Run: `pnpm verify:fast`
Expected: 0 errors across linting, type-checking, unit tests, component tests, integration tests, and contract tests.
