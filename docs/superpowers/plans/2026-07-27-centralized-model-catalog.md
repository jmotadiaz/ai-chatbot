# Centralized Model Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizar la definición de modelos en un nuevo package `packages/models` (fuente única de verdad) consumido por `chatbot` y `coding-agent`, eliminando la triple duplicación actual (configs por compañía + `chatModelKeys` + `CHAT_TO_PI` + `models.json` de Pi).

**Architecture:** `packages/models` contiene `MODEL_CATALOG` (datos puros, los 45 modelos actuales, sin AI SDK), helpers de mapping y un generador del `models.json` de Pi. El flag `userInvocable` es la única regla: define el selector del chat y el contenido de `models.json`. Invariante validado por test: `userInvocable → provider.kind === "opencodeGo"`. El chatbot deriva `LANGUAGE_MODEL_CONFIGURATIONS_CONST` y `chatModelKeys` del catálogo. El coding-agent genera `models.json` al arrancar e inyecta el `ModelRegistry` con path explícito.

**Tech Stack:** pnpm workspaces, TypeScript (ESM, `tsx`), Vitest 4, Next.js 16 (chatbot), `@earendil-works/pi-coding-agent` (worker).

**Spec:** `docs/superpowers/specs/2026-07-27-centralized-model-catalog-design.md`

**Deviations from spec (decididas durante la planificación):**
1. El CLI generador vive en `packages/coding-agent/scripts/generate-models.ts` (no en `packages/models`): mantiene `models` 100% puro (sin `node:fs`) y deja al coding-agent resolver el path con `getAgentDir()` de Pi, que es su dependencia natural.
2. La generación se encadena en el script `transport:http` del coding-agent (`tsx scripts/generate-models.ts && tsx src/transports/http.ts`) en vez de `predev`/`prestart`: `transport:http` es el único punto de entrada usado por `dev`, `start` y `worker:dev`, y no depende de la semántica de pre/post scripts de pnpm.
3. Se añade el campo opcional `wrapWithReasoningMiddleware?: boolean` al catálogo: el modelo "Sonar Reasoning" usa `wrapLanguageModel` + `reasoningMw` hoy, lo cual no es expresable como dato puro; el flag lo preserva.

**Convenciones del repo:**
- Commits con `Co-Authored-By: kimi-k3 <noreply@example.com>` (obligatorio por AGENTS.md).
- Pre-commit hook corre `pnpm --filter chatbot type:check` + `pnpm test:unit` automáticamente.
- Tests: `pnpm test:unit` (root). Typecheck worker: `pnpm build:worker` (root).
- Package compartido de referencia (patrón a copiar): `packages/tracing` (sin build, `main: ./src/index.ts`).

---

### Task 1: Scaffold de `packages/models`

**Files:**
- Create: `packages/models/package.json`
- Create: `packages/models/tsconfig.json`
- Modify: `package.json` (root — script `test:unit`)

- [ ] **Step 1: Crear `packages/models/package.json`**

```json
{
  "name": "models",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test:unit": "vitest run"
  },
  "devDependencies": {
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 2: Crear `packages/models/tsconfig.json`** (idéntico patrón que `packages/tracing/tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Crear placeholder `packages/models/src/index.ts`** (se completará en Task 4)

```ts
export {};
```

- [ ] **Step 4: Incluir los tests de `models` en el script root**

En `package.json` (root), cambiar:

```json
"test:unit": "pnpm --filter chatbot test:unit",
```

por:

```json
"test:unit": "pnpm --filter chatbot --filter models test:unit",
```

- [ ] **Step 5: Instalar para enlazar el workspace**

Run: `pnpm install`
Expected: `models` aparece como workspace project ("Scope: all 5 workspace projects").

- [ ] **Step 6: Commit**

```bash
git add packages/models package.json pnpm-lock.yaml
git commit -m "Scaffold packages/models shared package

Co-Authored-By: kimi-k3 <noreply@example.com>"
```

---

### Task 2: Catálogo de modelos (`catalog.ts`) con tests de integridad

**Files:**
- Create: `packages/models/src/catalog.ts`
- Test: `packages/models/src/catalog.test.ts`

- [ ] **Step 1: Escribir el test de integridad (falla)**

`packages/models/src/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { INVOCABLE_MODEL_IDS, MODEL_CATALOG } from "./catalog";

describe("MODEL_CATALOG integrity", () => {
  it("has unique ids", () => {
    const ids = MODEL_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique provider modelIds per provider kind", () => {
    const keys = MODEL_CATALOG.map(
      (e) => `${e.provider.kind}/${e.provider.modelId}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every userInvocable entry uses the opencodeGo provider", () => {
    const offenders = MODEL_CATALOG.filter(
      (e) => e.userInvocable && e.provider.kind !== "opencodeGo",
    );
    expect(offenders).toEqual([]);
  });

  it("exposes exactly the 6 coding-agent models as invocable, in order", () => {
    expect([...INVOCABLE_MODEL_IDS]).toEqual([
      "Deepseek v4 Flash",
      "Deepseek v4 Pro",
      "Kimi K2.6",
      "Qwen 3.6 Plus",
      "MiMo V2.5",
      "MiMo V2.5 Pro",
    ]);
  });

  it("keeps every model id used by internal chatbot features", () => {
    const ids = new Set(MODEL_CATALOG.map((e) => e.id));
    for (const internal of [
      "Llama 3.1 Instant",
      "GPT OSS Mini",
      "GPT OSS",
      "Nano Banana",
      "Gemini 2.5 Flash Lite",
      "Gemini 3 Flash",
      "Deepseek v4 Flash",
    ]) {
      expect(ids.has(internal)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm --filter models test:unit`
Expected: FAIL — `Cannot find module './catalog'`.

- [ ] **Step 3: Escribir `packages/models/src/catalog.ts` completo**

Contenido íntegro (migrado 1:1 desde los archivos por compañía del chatbot; `userInvocable: true` solo en los 6 modelos del `CHAT_TO_PI` actual):

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
  | "ai chatbot";

/** Provider factory kinds available in the chatbot's Providers interface. */
export type ProviderKind =
  | "opencodeGo"
  | "gateway"
  | "openrouter"
  | "openai"
  | "xai"
  | "groq"
  | "perplexity"
  | "lmstudio";

export interface ModelCatalogEntry {
  /** Display name. Stable: persisted in DB as modelId. */
  id: string;
  /** Appears in chat + coding-agent selectors and generates Pi's models.json. */
  userInvocable: boolean;
  /** Pure-data provider descriptor; the chatbot maps kind -> AI SDK factory. */
  provider: { kind: ProviderKind; modelId: string };
  company: Company;
  reasoning?: boolean;
  temperature?: number;
  topP?: number;
  topK?: number;
  contextWindow?: number;
  maxTokens?: number;
  supportedFiles?: readonly ("pdf" | "img")[];
  supportedOutput?: readonly ("text" | "img")[];
  /** Opaque passthrough, cast to the chatbot's ProviderOptions on derivation. */
  providerOptions?: Readonly<Record<string, unknown>>;
  /** Wrap with the chatbot's reasoningMw middleware (Sonar Reasoning). */
  wrapWithReasoningMiddleware?: boolean;
}

export const MODEL_CATALOG = [
  // --- userInvocable (coding-agent + chat selectors) ---
  {
    id: "Deepseek v4 Flash",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "deepseek-v4-flash" },
    company: "deepseek",
    reasoning: true,
    temperature: 1,
    topP: 0.95,
    providerOptions: { gateway: { zeroDataRetention: true } },
  },
  {
    id: "Deepseek v4 Pro",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "deepseek-v4-pro" },
    company: "deepseek",
    reasoning: true,
    temperature: 1,
    topP: 0.95,
  },
  {
    id: "Kimi K2.6",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "kimi-k2.6" },
    company: "moonshotai",
    reasoning: true,
    supportedFiles: ["img", "pdf"],
    temperature: 1.0,
    topP: 0.95,
  },
  {
    id: "Qwen 3.6 Plus",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "qwen3.6-plus" },
    company: "alibaba",
    reasoning: true,
    supportedFiles: ["pdf", "img"],
  },
  {
    id: "MiMo V2.5",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "mimo-v2.5" },
    company: "xiaomi",
    reasoning: true,
    temperature: 0.6,
    topP: 0.95,
  },
  {
    id: "MiMo V2.5 Pro",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "mimo-v2.5-pro" },
    company: "xiaomi",
    reasoning: true,
    temperature: 0.6,
    topP: 0.95,
  },
  // --- internal / non-selectable models (kept: used by chatbot features) ---
  {
    id: "StepFun 3.5",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "stepfun/step-3.5-flash:free" },
    company: "stepfun",
  },
  {
    id: "Llama 3.1 Instant",
    userInvocable: false,
    provider: {
      kind: "openrouter",
      modelId: "meta-llama/llama-3.1-8b-instruct",
    },
    company: "meta",
    temperature: 0.6,
  },
  {
    id: "Llama 3.3",
    userInvocable: false,
    provider: { kind: "groq", modelId: "llama-3.3-70b-versatile" },
    company: "meta",
    temperature: 0.6,
  },
  {
    id: "Llama 4 Scout",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "meta-llama/llama-4-scout" },
    company: "meta",
    temperature: 0.6,
    supportedFiles: ["img"],
  },
  {
    id: "Llama 4 Maverick",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "meta-llama/llama-4-maverick" },
    company: "meta",
    temperature: 0.6,
    supportedFiles: ["img"],
  },
  {
    id: "Magistral Medium",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "mistralai/mistral-medium-3.1" },
    company: "mistral",
    temperature: 0.6,
  },
  {
    id: "Magistral Small",
    userInvocable: false,
    provider: {
      kind: "openrouter",
      modelId: "mistralai/mistral-small-3.2-24b-instruct",
    },
    company: "mistral",
    temperature: 0.6,
  },
  {
    id: "Qwen 3.5 Flash",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "alibaba/qwen3.5-flash" },
    company: "alibaba",
    reasoning: true,
  },
  {
    id: "Qwen3 30b",
    userInvocable: false,
    provider: { kind: "lmstudio", modelId: "qwen/qwen3-30b-a3b-2507" },
    company: "alibaba",
    temperature: 0.6,
  },
  {
    id: "Qwen3 Coder",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "qwen/qwen3-coder" },
    company: "alibaba",
    temperature: 0.6,
  },
  {
    id: "MiniMax M2.7",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "minimax/minimax-m2.7" },
    company: "minimax",
    reasoning: true,
    temperature: 1,
    topP: 0.9,
    providerOptions: { gateway: { zeroDataRetention: true } },
  },
  {
    id: "MiniMax M2.5",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "minimax/minimax-m2.5" },
    company: "minimax",
    reasoning: true,
    temperature: 1,
    providerOptions: { gateway: { zeroDataRetention: true } },
  },
  {
    id: "GLM-4.7",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "z-ai/glm-4.7" },
    company: "zai",
    temperature: 0.6,
    topP: 0.95,
  },
  {
    id: "GLM-4.7 Flash",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "zai/glm-4.7-flash" },
    company: "zai",
    reasoning: true,
    temperature: 0.6,
    topP: 0.95,
  },
  {
    id: "GLM-5.1",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "zai/glm-5.1" },
    company: "zai",
    reasoning: true,
    temperature: 0.6,
    topP: 0.95,
  },
  {
    id: "Sonar",
    userInvocable: false,
    provider: { kind: "perplexity", modelId: "sonar" },
    company: "perplexity",
    temperature: 0.6,
    supportedFiles: ["img"],
  },
  {
    id: "Sonar Pro",
    userInvocable: false,
    provider: { kind: "perplexity", modelId: "sonar-pro" },
    company: "perplexity",
    temperature: 0.6,
    supportedFiles: ["img"],
  },
  {
    id: "Sonar Reasoning",
    userInvocable: false,
    provider: { kind: "perplexity", modelId: "sonar-pro" },
    company: "perplexity",
    reasoning: true,
    temperature: 0.6,
    supportedFiles: ["img"],
    wrapWithReasoningMiddleware: true,
  },
  {
    id: "Claude Haiku 4.5",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "anthropic/claude-haiku-4.5" },
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
    providerOptions: {
      anthropic: {
        sendReasoning: true,
        thinking: { type: "enabled", budgetTokens: 10000 },
      },
      gateway: { zeroDataRetention: true },
    },
  },
  {
    id: "Claude Sonnet 4.6",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "anthropic/claude-sonnet-4.6" },
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    providerOptions: {
      anthropic: {
        sendReasoning: true,
        thinking: { type: "enabled", budgetTokens: 10000 },
      },
      gateway: { zeroDataRetention: true },
    },
  },
  {
    id: "Claude Opus 4.5",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "anthropic/claude-opus-4.5" },
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    providerOptions: {
      anthropic: {
        sendReasoning: true,
        thinking: { type: "enabled", budgetTokens: 10000 },
      },
      gateway: { zeroDataRetention: true },
    },
  },
  {
    id: "GPT OSS",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "openai/gpt-oss-120b" },
    company: "openai",
    temperature: 0.6,
    reasoning: true,
  },
  {
    id: "GPT OSS Mini",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "openai/gpt-oss-20b" },
    company: "openai",
    reasoning: true,
    temperature: 0.6,
  },
  {
    id: "o4 Mini",
    userInvocable: false,
    provider: { kind: "openai", modelId: "o4-mini" },
    company: "openai",
    reasoning: true,
    temperature: 0.6,
  },
  {
    id: "o3",
    userInvocable: false,
    provider: { kind: "openai", modelId: "o3" },
    company: "openai",
    reasoning: true,
    temperature: 0.6,
  },
  {
    id: "GPT 5 Nano",
    userInvocable: false,
    provider: { kind: "openai", modelId: "gpt-5-nano-2025-08-07" },
    company: "openai",
    temperature: 0.6,
    providerOptions: {
      openai: { textVerbosity: "low", serviceTier: "priority" },
    },
  },
  {
    id: "GPT 5.4 Mini",
    userInvocable: false,
    provider: { kind: "openai", modelId: "gpt-5.4-mini-2026-03-17" },
    company: "openai",
    reasoning: true,
    providerOptions: {
      openai: {
        textVerbosity: "low",
        reasoningEffort: "high",
        reasoningSummary: "auto",
      },
    },
    supportedFiles: ["img", "pdf"],
  },
  {
    id: "GPT 5.4",
    userInvocable: false,
    provider: { kind: "openai", modelId: "gpt-5.4-2026-03-05" },
    company: "openai",
    reasoning: true,
    providerOptions: {
      openai: {
        textVerbosity: "low",
        reasoningEffort: "high",
        reasoningSummary: "auto",
      },
    },
    supportedFiles: ["img", "pdf"],
  },
  {
    id: "Gemini 2.5 Flash Lite",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "google/gemini-2.5-flash-lite" },
    company: "google",
    temperature: 0.6,
    reasoning: true,
  },
  {
    id: "Gemini 2.5 Flash",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "google/gemini-2.5-flash" },
    company: "google",
    temperature: 0.6,
    reasoning: true,
    providerOptions: {
      google: {
        thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
      },
    },
  },
  {
    id: "Gemini 3 Flash",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "google/gemini-3-flash-preview" },
    company: "google",
    temperature: 0.6,
    reasoning: true,
    supportedFiles: ["img", "pdf"],
    providerOptions: {
      google: {
        thinkingConfig: { includeThoughts: true, thinkingLevel: "high" },
      },
    },
  },
  {
    id: "Gemini 3.1 Flash Lite",
    userInvocable: false,
    provider: {
      kind: "openrouter",
      modelId: "google/gemini-3.1-flash-lite-preview",
    },
    company: "google",
    temperature: 0.6,
  },
  {
    id: "Gemini 3.1 Pro",
    userInvocable: false,
    provider: {
      kind: "openrouter",
      modelId: "google/gemini-3.1-pro-preview",
    },
    company: "google",
    supportedFiles: ["img", "pdf"],
    temperature: 0.6,
    providerOptions: {
      google: { thinkingConfig: { thinkingLevel: "high" } },
    },
  },
  {
    id: "Nano Banana",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "google/gemini-2.5-flash-image" },
    company: "google",
    temperature: 0.6,
    supportedFiles: ["img"],
    supportedOutput: ["img"],
  },
  {
    id: "Grok Code Fast",
    userInvocable: false,
    provider: { kind: "xai", modelId: "grok-code-fast-1" },
    company: "xai",
    temperature: 0.6,
  },
  {
    id: "Grok 4.1 Fast",
    userInvocable: false,
    provider: { kind: "xai", modelId: "grok-4-1-fast" },
    company: "xai",
    temperature: 0.6,
    supportedFiles: ["img"],
    reasoning: true,
  },
  {
    id: "Grok 4.3",
    userInvocable: false,
    provider: { kind: "xai", modelId: "grok-4.3" },
    company: "xai",
    temperature: 0.6,
    supportedFiles: ["img"],
    reasoning: true,
  },
  {
    id: "Nemotron 3 Nano",
    userInvocable: false,
    provider: {
      kind: "openrouter",
      modelId: "nvidia/nemotron-3-nano-30b-a3b:free",
    },
    company: "nvidia",
    temperature: 0.6,
    topP: 0.95,
    reasoning: true,
    contextWindow: 64_000,
  },
  {
    id: "Nemotron 3 Super",
    userInvocable: false,
    provider: {
      kind: "openrouter",
      modelId: "nvidia/nemotron-3-super-120b-a12b:free",
    },
    company: "nvidia",
    temperature: 1,
    topP: 0.95,
    reasoning: true,
  },
] as const satisfies readonly ModelCatalogEntry[];

export type ModelId = (typeof MODEL_CATALOG)[number]["id"];

export type InvocableModelId = Extract<
  (typeof MODEL_CATALOG)[number],
  { userInvocable: true }
>["id"];

export const INVOCABLE_MODEL_IDS = MODEL_CATALOG.filter(
  (
    e,
  ): e is Extract<(typeof MODEL_CATALOG)[number], { userInvocable: true }> =>
    e.userInvocable,
).map((e) => e.id);
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm --filter models test:unit`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/models/src/catalog.ts packages/models/src/catalog.test.ts
git commit -m "Add model catalog with integrity tests

Co-Authored-By: kimi-k3 <noreply@example.com>"
```

---

### Task 3: Helpers de mapping (`mapping.ts`)

**Files:**
- Create: `packages/models/src/mapping.ts`
- Test: `packages/models/src/mapping.test.ts`

- [ ] **Step 1: Escribir el test (falla)** — portado y ampliado desde `packages/chatbot/tests/unit/agent-code/model-mapping.test.ts`

`packages/models/src/mapping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  filterAvailableChatModels,
  PI_PROVIDER,
  toChatModelId,
  toPiModelId,
} from "./mapping";

describe("model mapping", () => {
  it("maps an invocable model id to its Pi model", () => {
    expect(toPiModelId("Deepseek v4 Pro")).toEqual({
      providerId: "opencode-go",
      modelId: "deepseek-v4-pro",
    });
  });

  it("throws for a non-invocable catalog model", () => {
    expect(() => toPiModelId("GPT 5.4")).toThrow(
      "Unsupported coding agent model: GPT 5.4",
    );
  });

  it("throws for an unknown model id", () => {
    expect(() => toPiModelId("Nope")).toThrow(
      "Unsupported coding agent model: Nope",
    );
  });

  it("maps a Pi model back to its catalog id", () => {
    expect(toChatModelId("opencode-go", "deepseek-v4-pro")).toBe(
      "Deepseek v4 Pro",
    );
  });

  it("returns undefined for other providers or unknown pi model ids", () => {
    expect(toChatModelId("anthropic", "deepseek-v4-pro")).toBeUndefined();
    expect(toChatModelId("opencode-go", "unknown-model")).toBeUndefined();
  });

  it("filters Pi models to the invocable catalog intersection, sorted", () => {
    const result = filterAvailableChatModels([
      { providerId: "opencode-go", modelId: "mimo-v2.5" },
      { providerId: "opencode-go", modelId: "deepseek-v4-pro" },
      { providerId: "opencode-go", modelId: "unknown-model" },
    ]);
    expect(result).toEqual(["Deepseek v4 Pro", "MiMo V2.5"]);
  });

  it("exposes the Pi provider id", () => {
    expect(PI_PROVIDER).toBe("opencode-go");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm --filter models test:unit`
Expected: FAIL — `Cannot find module './mapping'`.

- [ ] **Step 3: Escribir `packages/models/src/mapping.ts`**

```ts
import { MODEL_CATALOG, type InvocableModelId } from "./catalog";

export const PI_PROVIDER = "opencode-go";

export function toPiModelId(modelId: string): {
  providerId: string;
  modelId: string;
} {
  const entry = MODEL_CATALOG.find((e) => e.id === modelId && e.userInvocable);
  if (!entry || entry.provider.kind !== "opencodeGo") {
    throw new Error(`Unsupported coding agent model: ${modelId}`);
  }
  return { providerId: PI_PROVIDER, modelId: entry.provider.modelId };
}

export function toChatModelId(
  providerId: string,
  modelId: string,
): InvocableModelId | undefined {
  if (providerId !== PI_PROVIDER) return undefined;
  const entry = MODEL_CATALOG.find(
    (e) =>
      e.userInvocable &&
      e.provider.kind === "opencodeGo" &&
      e.provider.modelId === modelId,
  );
  return entry?.id as InvocableModelId | undefined;
}

export function filterAvailableChatModels(
  piModels: Array<{ providerId: string; modelId: string }>,
): InvocableModelId[] {
  return piModels
    .map(({ providerId, modelId }) => toChatModelId(providerId, modelId))
    .filter((m): m is InvocableModelId => m !== undefined)
    .sort();
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm --filter models test:unit`
Expected: PASS (7 tests nuevos + 5 de catálogo).

- [ ] **Step 5: Commit**

```bash
git add packages/models/src/mapping.ts packages/models/src/mapping.test.ts
git commit -m "Add catalog-driven Pi model mapping helpers

Co-Authored-By: kimi-k3 <noreply@example.com>"
```

---

### Task 4: Generador de `models.json` + exports públicos

**Files:**
- Create: `packages/models/src/generate-models-json.ts`
- Test: `packages/models/src/generate-models-json.test.ts`
- Modify: `packages/models/src/index.ts`

- [ ] **Step 1: Escribir el test (falla)**

`packages/models/src/generate-models-json.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateModelsJson } from "./generate-models-json";
import { INVOCABLE_MODEL_IDS } from "./catalog";

describe("generateModelsJson", () => {
  const json = generateModelsJson();

  it("emits one Pi model per invocable catalog entry", () => {
    const models = json.providers["opencode-go"].models;
    expect(models).toHaveLength(INVOCABLE_MODEL_IDS.length);
    expect(models.map((m) => m.name)).toEqual([...INVOCABLE_MODEL_IDS]);
  });

  it("uses the provider modelId as Pi id", () => {
    const models = json.providers["opencode-go"].models;
    expect(models.find((m) => m.name === "Deepseek v4 Pro")?.id).toBe(
      "deepseek-v4-pro",
    );
  });

  it("derives image input from supportedFiles", () => {
    const models = json.providers["opencode-go"].models;
    expect(models.find((m) => m.name === "Kimi K2.6")?.input).toEqual([
      "text",
      "image",
    ]);
    expect(models.find((m) => m.name === "Deepseek v4 Pro")?.input).toEqual([
      "text",
    ]);
  });

  it("carries reasoning and omits optional numeric fields when absent", () => {
    const models = json.providers["opencode-go"].models;
    const pro = models.find((m) => m.name === "Deepseek v4 Pro");
    expect(pro?.reasoning).toBe(true);
    expect(pro).not.toHaveProperty("contextWindow");
    expect(pro).not.toHaveProperty("maxTokens");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm --filter models test:unit`
Expected: FAIL — `Cannot find module './generate-models-json'`.

- [ ] **Step 3: Escribir `packages/models/src/generate-models-json.ts`**

```ts
import { MODEL_CATALOG } from "./catalog";
import { PI_PROVIDER } from "./mapping";

export interface PiModelDefinition {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  contextWindow?: number;
  maxTokens?: number;
}

export interface PiModelsJson {
  providers: Record<string, { models: PiModelDefinition[] }>;
}

/**
 * Build Pi's models.json from the catalog. Every userInvocable entry is an
 * opencodeGo model (enforced by catalog integrity tests).
 */
export function generateModelsJson(
  catalog: typeof MODEL_CATALOG = MODEL_CATALOG,
): PiModelsJson {
  const models: PiModelDefinition[] = catalog
    .filter((e) => e.userInvocable)
    .map((e) => ({
      id: e.provider.modelId,
      name: e.id,
      reasoning: e.reasoning ?? false,
      input: [
        "text" as const,
        ...(e.supportedFiles?.includes("img") ? (["image" as const]) : []),
      ],
      ...(e.contextWindow !== undefined && { contextWindow: e.contextWindow }),
      ...(e.maxTokens !== undefined && { maxTokens: e.maxTokens }),
    }));

  return { providers: { [PI_PROVIDER]: { models } } };
}
```

- [ ] **Step 4: Completar `packages/models/src/index.ts`**

Reemplazar el placeholder por:

```ts
export {
  MODEL_CATALOG,
  INVOCABLE_MODEL_IDS,
  type Company,
  type InvocableModelId,
  type ModelCatalogEntry,
  type ModelId,
  type ProviderKind,
} from "./catalog";
export {
  PI_PROVIDER,
  filterAvailableChatModels,
  toChatModelId,
  toPiModelId,
} from "./mapping";
export {
  generateModelsJson,
  type PiModelDefinition,
  type PiModelsJson,
} from "./generate-models-json";
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `pnpm --filter models test:unit`
Expected: PASS (16 tests en total).

- [ ] **Step 6: Commit**

```bash
git add packages/models/src/generate-models-json.ts packages/models/src/generate-models-json.test.ts packages/models/src/index.ts
git commit -m "Add Pi models.json generator

Co-Authored-By: kimi-k3 <noreply@example.com>"
```

---

### Task 5: Chatbot — derivar configs del catálogo y borrar archivos por compañía

Refactor puro: los tests existentes del chatbot son la red de seguridad. **No** se cambia comportamiento salvo el selector (pasa de 23 a 6 modelos — decidido en el spec).

**Files:**
- Modify: `packages/chatbot/package.json` (añadir dep `models`)
- Modify: `packages/chatbot/lib/features/foundation-model/config.ts` (reescritura)
- Modify: `packages/chatbot/lib/features/foundation-model/types.ts` (Company)
- Delete: `packages/chatbot/lib/features/foundation-model/{alibaba,anthropic,deepseek,google,meta,minimax,mistral,moonshotai,nvidia,openai,perplexity,stepfun,xai,xiaomi,zai}.ts`

- [ ] **Step 1: Añadir la dependencia**

En `packages/chatbot/package.json`, dentro de `dependencies`, añadir (orden alfabético junto a `"coding-agent"`/`"tracing"`):

```json
"models": "workspace:*",
```

Run: `pnpm install`
Expected: sin errores; `models` enlazado.

- [ ] **Step 2: Reescribir `packages/chatbot/lib/features/foundation-model/config.ts`**

Contenido íntegro (la API pública se mantiene: `chatModelKeys`, `chatModelId`, `CHAT_MODELS`, `defaultModel`, `LanguageModelKeys`, `languageModelConfigurations`, `getChatConfigurationByModelId`, defaults):

```ts
import deepmerge from "deepmerge";
import { wrapLanguageModel } from "ai";
import {
  INVOCABLE_MODEL_IDS,
  MODEL_CATALOG,
  type InvocableModelId,
  type ModelId,
} from "models";
import { providers } from "@/lib/infrastructure/ai/providers";
import type { ModelConfiguration, ProviderOptions } from "./types";
import { reasoningMw } from "./utils";

const buildModelConfiguration = (
  entry: (typeof MODEL_CATALOG)[number],
): ModelConfiguration => {
  const base = providers[entry.provider.kind](entry.provider.modelId);
  return {
    model: entry.wrapWithReasoningMiddleware
      ? wrapLanguageModel({ model: base, middleware: [reasoningMw] })
      : base,
    company: entry.company,
    ...(entry.reasoning !== undefined && { reasoning: entry.reasoning }),
    ...(entry.temperature !== undefined && { temperature: entry.temperature }),
    ...(entry.topP !== undefined && { topP: entry.topP }),
    ...(entry.topK !== undefined && { topK: entry.topK }),
    ...(entry.contextWindow !== undefined && {
      contextWindow: entry.contextWindow,
    }),
    ...(entry.supportedFiles && {
      supportedFiles: [...entry.supportedFiles],
    }),
    ...(entry.supportedOutput && {
      supportedOutput: [...entry.supportedOutput],
    }),
    ...(entry.providerOptions && {
      providerOptions: entry.providerOptions as ProviderOptions,
    }),
  };
};

export const LANGUAGE_MODEL_CONFIGURATIONS_CONST: Record<
  ModelId,
  ModelConfiguration
> = Object.fromEntries(
  MODEL_CATALOG.map((entry) => [entry.id, buildModelConfiguration(entry)]),
) as Record<ModelId, ModelConfiguration>;

export type LanguageModelKeys = ModelId;

export const chatModelKeys: chatModelId[] = [...INVOCABLE_MODEL_IDS];

export type chatModelId = InvocableModelId;

export const CHAT_MODELS: chatModelId[] = [...chatModelKeys];

// Constants
export const defaultModel: chatModelId = chatModelKeys[0];

export const defaultWebSearchNumResults = 4;
export const defaultRagMaxResources = 4;
export const defaultMinRagScore = 0.5;

// Helpers
export const languageModelConfigurations = (
  modelKey: LanguageModelKeys,
  { providerOptions }: { providerOptions?: ProviderOptions } = {},
): ModelConfiguration => {
  const baseConfig: ModelConfiguration =
    LANGUAGE_MODEL_CONFIGURATIONS_CONST[modelKey];

  if (providerOptions && baseConfig.providerOptions) {
    return {
      ...baseConfig,
      providerOptions: deepmerge(baseConfig.providerOptions, providerOptions),
    };
  }

  return {
    ...baseConfig,
    ...(providerOptions && { providerOptions }),
  };
};

export interface ChatModelConfiguration {
  company: ModelConfiguration["company"];
  temperature?: number;
  topP?: number;
  topK?: number;
  contextWindow?: number;
  reasoning: boolean;
  zeroDataRetention?: boolean;
  supportedFiles: Required<ModelConfiguration>["supportedFiles"];
  supportedOutput: Required<ModelConfiguration>["supportedOutput"];
}

export const getChatConfigurationByModelId = (
  modelId: chatModelId,
): ChatModelConfiguration => {
  const modelConfig = languageModelConfigurations(modelId);

  return {
    company: modelConfig.company,
    temperature: modelConfig.temperature,
    topP: modelConfig.topP,
    topK: modelConfig.topK,
    contextWindow: modelConfig.contextWindow,
    reasoning: modelConfig.reasoning ?? false,
    zeroDataRetention: modelConfig.providerOptions?.gateway?.zeroDataRetention,
    supportedFiles: modelConfig.supportedFiles ?? [],
    supportedOutput: modelConfig.supportedOutput ?? ["text"],
  };
};
```

- [ ] **Step 3: Mover `Company` a `models` (re-export en types.ts)**

En `packages/chatbot/lib/features/foundation-model/types.ts`, reemplazar el bloque:

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
  | "ai chatbot";
```

por:

```ts
import type { Company } from "models";
export type { Company };
```

- [ ] **Step 4: Borrar los 15 archivos por compañía**

```bash
git rm packages/chatbot/lib/features/foundation-model/{alibaba,anthropic,deepseek,google,meta,minimax,mistral,moonshotai,nvidia,openai,perplexity,stepfun,xai,xiaomi,zai}.ts
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter chatbot type:check`
Expected: PASS. Si aparecen errores por referencias a modelos ya no invocables tipados como `chatModelId` (p.ej. casts en tests/evals), corregir el sitio concreto sin cambiar lógica (los modelos siguen en el catálogo como `ModelId`).

- [ ] **Step 6: Tests del chatbot**

Run: `pnpm --filter chatbot test:unit`
Expected: PASS (375 tests, excepto `model-mapping.test.ts` que se mueve en Task 6 — ese aún pasa porque `model-mapping.ts` aún existe).

- [ ] **Step 7: Commit**

```bash
git add packages/chatbot/package.json packages/chatbot/lib/features/foundation-model pnpm-lock.yaml
git commit -m "Derive chatbot model configs from the shared catalog

Co-Authored-By: kimi-k3 <noreply@example.com>"
```

---

### Task 6: Chatbot — consumir mapping desde `models` y borrar `model-mapping.ts`

**Files:**
- Modify: `packages/chatbot/lib/features/code/actions.ts:15`
- Modify: `packages/chatbot/app/(chat)/api/agent/code/route.ts:22`
- Modify: `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/model/route.ts:4`
- Delete: `packages/chatbot/lib/features/code/model-mapping.ts`
- Delete: `packages/chatbot/tests/unit/agent-code/model-mapping.test.ts`

- [ ] **Step 1: Actualizar los 3 imports**

En `packages/chatbot/lib/features/code/actions.ts`:

```ts
// antes
import { filterAvailableChatModels } from "./model-mapping";
// después
import { filterAvailableChatModels } from "models";
```

En `packages/chatbot/app/(chat)/api/agent/code/route.ts`:

```ts
// antes
import { toPiModelId } from "@/lib/features/code/model-mapping";
// después
import { toPiModelId } from "models";
```

En `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/model/route.ts`:

```ts
// antes
import { toChatModelId } from "@/lib/features/code/model-mapping";
// después
import { toChatModelId } from "models";
```

- [ ] **Step 2: Borrar el módulo y su test (ya portado a `packages/models`)**

```bash
git rm packages/chatbot/lib/features/code/model-mapping.ts packages/chatbot/tests/unit/agent-code/model-mapping.test.ts
```

- [ ] **Step 3: Typecheck + tests**

Run: `pnpm --filter chatbot type:check && pnpm --filter chatbot test:unit`
Expected: PASS (372 tests en chatbot — los 3 de mapping ahora viven en `models`).

- [ ] **Step 4: Commit**

```bash
git add packages/chatbot
git commit -m "Consume Pi model mapping from the shared models package

Co-Authored-By: kimi-k3 <noreply@example.com>"
```

---

### Task 7: Coding-agent — path de models.json, generación en arranque e inyección del registry

**Files:**
- Create: `packages/coding-agent/src/models.ts`
- Create: `packages/coding-agent/scripts/generate-models.ts`
- Modify: `packages/coding-agent/package.json` (dep `models`, export `./models`, script `transport:http`)
- Modify: `packages/coding-agent/src/session-manager.ts:210-236` (`makeCreateRuntime`) y `:887-906` (`getAvailableModels`)
- Test: `packages/chatbot/tests/unit/agent-code/models-path.test.ts` (los tests del worker viven en el chatbot, patrón existente)

- [ ] **Step 1: Escribir el test (falla)**

`packages/chatbot/tests/unit/agent-code/models-path.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { getModelsJsonPath } from "coding-agent/models";

describe("getModelsJsonPath", () => {
  const original = process.env.CODING_AGENT_MODELS_JSON;

  afterEach(() => {
    if (original === undefined) delete process.env.CODING_AGENT_MODELS_JSON;
    else process.env.CODING_AGENT_MODELS_JSON = original;
  });

  it("honours the CODING_AGENT_MODELS_JSON override", () => {
    process.env.CODING_AGENT_MODELS_JSON = "/tmp/custom-models.json";
    expect(getModelsJsonPath()).toBe("/tmp/custom-models.json");
  });

  it("defaults to models.json inside the Pi agent dir", () => {
    delete process.env.CODING_AGENT_MODELS_JSON;
    expect(getModelsJsonPath()).toMatch(/models\.json$/);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm --filter chatbot test:unit -- models-path`
Expected: FAIL — `Cannot find module 'coding-agent/models'`.

- [ ] **Step 3: Crear `packages/coding-agent/src/models.ts`**

```ts
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * Path of the Pi models.json generated from the shared model catalog.
 * Override with CODING_AGENT_MODELS_JSON (e.g. tests, custom deployments).
 */
export function getModelsJsonPath(): string {
  return process.env.CODING_AGENT_MODELS_JSON ?? path.join(getAgentDir(), "models.json");
}
```

- [ ] **Step 4: Crear `packages/coding-agent/scripts/generate-models.ts`**

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateModelsJson } from "models";
import { getModelsJsonPath } from "../src/models";

const target = getModelsJsonPath();
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(generateModelsJson(), null, 2)}\n`);
console.log(`models.json written to ${target}`);
```

- [ ] **Step 5: Actualizar `packages/coding-agent/package.json`**

En `dependencies`, añadir:

```json
"models": "workspace:*",
```

En `exports`, añadir (mantener orden alfabético):

```json
"./models": "./src/models.ts",
```

Cambiar el script `transport:http`:

```json
// antes
"transport:http": "tsx src/transports/http.ts"
// después
"transport:http": "tsx scripts/generate-models.ts && tsx src/transports/http.ts"
```

Run: `pnpm install`

- [ ] **Step 6: Ejecutar el test y verificar que pasa**

Run: `pnpm --filter chatbot test:unit -- models-path`
Expected: PASS (2 tests).

- [ ] **Step 7: Inyectar el registry en `session-manager.ts`**

Añadir el import al bloque de imports locales (tras `FILE_REFERENCE_PROMPT`):

```ts
import { getModelsJsonPath } from "./models";
```

En `makeCreateRuntime` (líneas ~213-219), cambiar:

```ts
    const services = await createAgentSessionServices({
      cwd: runtimeCwd,
      resourceLoaderOptions: {
        appendSystemPrompt: [FILE_REFERENCE_PROMPT],
      },
    });
```

por:

```ts
    const authStorage = AuthStorage.create(
      path.join(getAgentDir(), "auth.json"),
    );
    const services = await createAgentSessionServices({
      cwd: runtimeCwd,
      authStorage,
      modelRegistry: ModelRegistry.create(authStorage, getModelsJsonPath()),
      resourceLoaderOptions: {
        appendSystemPrompt: [FILE_REFERENCE_PROMPT],
      },
    });
```

(El `authStorage` explícito replica el default interno actual — `join(agentDir, "auth.json")` — así que no hay cambio de comportamiento; es necesario para compartir la instancia con el registry.)

En `getAvailableModels` (línea ~894), cambiar:

```ts
  const registry = ModelRegistry.create(authStorage);
```

por:

```ts
  const registry = ModelRegistry.create(authStorage, getModelsJsonPath());
```

- [ ] **Step 8: Typecheck del worker + tests**

Run: `pnpm build:worker && pnpm test:unit`
Expected: PASS (tsc del coding-agent sin errores; suite completa verde).

- [ ] **Step 9: Verificar la generación del archivo**

Run: `pnpm --filter coding-agent exec tsx scripts/generate-models.ts`
Expected output: `models.json written to <agentDir>/models.json`. Después:

Run: `node -e "const m=require(process.env.HOME + '/.pi/agent/models.json'); console.log(m.providers['opencode-go'].models.map(x=>x.id).join(','))"` — si el agent dir por defecto difiere, usar el path impreso por el paso anterior.
Expected: `deepseek-v4-flash,deepseek-v4-pro,kimi-k2.6,qwen3.6-plus,mimo-v2.5,mimo-v2.5-pro`

- [ ] **Step 10: Commit**

```bash
git add packages/coding-agent packages/chatbot/tests/unit/agent-code/models-path.test.ts pnpm-lock.yaml
git commit -m "Generate Pi models.json from the shared catalog at worker startup

Co-Authored-By: kimi-k3 <noreply@example.com>"
```

---

### Task 8: Documentación y verificación final

**Files:**
- Modify: `AGENTS.md` (root — estructura del monorepo + grafo de dependencias)

- [ ] **Step 1: Actualizar `AGENTS.md` (root)**

En la sección "Monorepo Structure", cambiar el bloque de packages:

```
packages/
├── chatbot/        # Main Next.js web application
├── coding-agent/   # Coding agent HTTP worker
└── tracing/        # Shared tracing/observability library
```

por:

```
packages/
├── chatbot/        # Main Next.js web application
├── coding-agent/   # Coding agent HTTP worker
├── models/         # Shared model catalog (single source of truth for model
                    # definitions, Pi mapping and models.json generation)
└── tracing/        # Shared tracing/observability library
```

Y el "Dependency Graph":

```
chatbot ──→ coding-agent ──→ tracing
   └──────────────────────→ tracing
```

por:

```
chatbot ──→ coding-agent ──→ tracing
   │              │
   ├────→ tracing ├────→ models
   └────→ models ←┘
```

- [ ] **Step 2: Verificación completa**

Run: `pnpm type:check && pnpm build:worker && pnpm test:unit && pnpm lint:fix`
Expected: todo verde; `lint:fix` sin cambios pendientes (o commitearlos si los hay).

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "Document the models package in the monorepo structure

Co-Authored-By: kimi-k3 <noreply@example.com>"
```

---

## Self-Review realizado

- **Spec coverage:** catálogo completo con `userInvocable` (Task 2), mapping (Task 3), generador (Task 4), derivación chatbot + borrado de archivos (Task 5), imports y borrado de model-mapping (Task 6), coding-agent path/generación/inyección (Task 7), invariante por test (Task 2 Step 1), AGENTS.md (Task 8). Fallback de IDs stale: sin cambios necesarios — los 17 modelos no invocables permanecen en `LANGUAGE_MODEL_CONFIGURATIONS_CONST` (Task 5 conserva las claves vía `ModelId`).
- **Placeholders:** ninguno; todo el código está completo, incluido el catálogo de 45 entradas migrado 1:1.
- **Type consistency:** `InvocableModelId` (models) ↔ `chatModelId` (chatbot, alias); `getModelsJsonPath` definido en Task 7 Step 3 y usado en Steps 4/7; `generateModelsJson` exportado en Task 4 y consumido en Task 7; nombres de campos del catálogo idénticos entre Tasks 2/4/5 (`provider.kind`, `provider.modelId`, `wrapWithReasoningMiddleware`).
