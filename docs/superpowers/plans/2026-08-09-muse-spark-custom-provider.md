# Muse Spark (Meta Model API) como custom provider de Pi — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir "Muse Spark 1.2" (Meta Model API, tier contributor) como modelo seleccionable en el chat y el coding agent, registrado como el primer custom provider (`meta`) en el `models.json` que Pi consume.

> **Nota de orden de ejecución (decisión del usuario 2026-08-09):** la Task 5 (chat factory) se ejecuta en segundo lugar, después de la Task 1. Añadir `metaModelApi` a `ProviderKind` rompe el type:check del chatbot hasta que la factory existe, así que Tasks 1 → 5 → 2 → 3 → 4 mantiene el pre-commit hook verde en cada commit. La numeración de tareas no cambia.

**Architecture:** El catálogo central (`packages/models`) es la única fuente de verdad. `generateModelsJson` pasa de emitir un solo provider (`opencode-go`) a dos (`opencode-go` + `meta`, este último con `baseUrl`/`api`/`apiKey` propios). El worker elimina su filtro hardcodeado de provider y el chatbot añade una factory `createOpenAICompatible` para el chat. El mapping catálogo↔Pi se generaliza con `toPiProviderId`.

**Tech Stack:** TypeScript, pnpm workspace, vitest, Pi coding agent (`@earendil-works/pi-coding-agent`), AI SDK (`@ai-sdk/openai-compatible`), OpenAI-compatible Chat Completions de Meta (`https://api.meta.ai/v1`).

## Global Constraints

Valores exactos tomados de la spec `docs/superpowers/specs/2026-08-09-muse-spark-custom-provider-design.md`:

- Catalog id: `"Muse Spark 1.2"` — el sufijo `-contributor` solo existe en `provider.modelId` (`"muse-spark-1.2-contributor"`, el id que exige la API de Meta).
- `ProviderKind` nuevo: `"metaModelApi"`; pi provider key: `"meta"`.
- `baseUrl: "https://api.meta.ai/v1"`, `api: "openai-completions"`, `apiKey: "$META_API_KEY"` (apiKey env: `META_API_KEY`).
- `reasoning: true`, `defaultThinkingLevel: "xhigh"`, `thinkingLevelMap: { off: null, minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh" }`.
- `contextWindow: 1_048_576`, `maxTokens: 131_072`, `cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0.002 }`.
- Sin `temperature`/`topP`/`supportedFiles` (primera integración solo texto).
- Regla de selección: `userInvocable` es la **única** condición (se elimina el invariante `userInvocable → opencodeGo`; no reintroducir ninguna restricción de kind).
- `META_API_KEY` la añade el usuario a `.env.development.local` (raíz); **nunca** commitearla.
- Cada commit lleva trailer `Co-Authored-By: Pi Coding Agent <pi@example.com>`.

---

### Task 1: Catálogo — `metaModelApi` kind + entrada "Muse Spark 1.2"

**Files:**
- Modify: `packages/models/src/catalog.ts` (ProviderKind + entrada al final de la sección `userInvocable`)
- Test: `packages/models/src/catalog.test.ts`

**Interfaces:**
- Produces: kind `"metaModelApi"` en `ProviderKind`; entrada de catálogo `{ id: "Muse Spark 1.2", userInvocable: true, provider: { kind: "metaModelApi", modelId: "muse-spark-1.2-contributor" }, company: "meta", reasoning: true, defaultThinkingLevel: "xhigh", thinkingLevelMap: { off: null, minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh" }, contextWindow: 1_048_576, maxTokens: 131_072, cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0.002 } }`.

- [ ] **Step 1: Escribir los tests que fallan** — en `packages/models/src/catalog.test.ts`:

```ts
it("exposes exactly the coding-agent models as invocable, in order", () => {
  expect([...INVOCABLE_MODEL_IDS]).toEqual([
    "Deepseek v4 Flash",
    "Deepseek v4 Pro",
    "Kimi K2.7 Code",
    "Kimi K3",
    "MiniMax M3",
    "Qwen 3.7 Plus",
    "Qwen 3.8 Max",
    "MiMo V2.5",
    "MiMo V2.5 Pro",
    "Muse Spark 1.2",
  ]);
});
```

Reemplazar el test `"every userInvocable entry uses the opencodeGo provider"` (que ahora es el invariante eliminado) por:

```ts
it("custom-provider entries (metaModelApi) fully describe their Pi model", () => {
  const custom = MODEL_CATALOG.filter((e) => e.provider.kind === "metaModelApi");
  expect(custom.length).toBeGreaterThan(0);
  for (const entry of custom) {
    expect(entry.userInvocable).toBe(true);
    expect(entry.reasoning).toBe(true);
    expect(entry.defaultThinkingLevel).toBe("xhigh");
    expect(entry.contextWindow).toBeGreaterThan(0);
    expect(entry.maxTokens).toBeGreaterThan(0);
    expect(entry.cost).toBeDefined();
    expect(entry.thinkingLevelMap).toBeDefined();
    expect(entry.thinkingLevelMap?.off).toBeNull(); // Muse no permite desactivar reasoning
  }
});
```

Añadir al describe `defaultThinkingLevel`:

```ts
it("resolves the catalog default for known coding-agent models", () => {
  expect(getDefaultThinkingLevel("Deepseek v4 Pro")).toBe("xhigh");
  expect(getDefaultThinkingLevel("Kimi K2.7 Code")).toBe("high");
  expect(getDefaultThinkingLevel("Muse Spark 1.2")).toBe("xhigh");
});
```

Añadir al describe `getSupportedThinkingLevels`:

```ts
it("hides off when the map nulls it and keeps minimal..xhigh for Muse Spark", () => {
  expect(
    getSupportedThinkingLevels(true, {
      off: null,
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
    }),
  ).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `pnpm --filter models test:unit`
Expected: FAIL — los tests nuevos fallan (`Muse Spark 1.2` no existe; kind no reconocido).

- [ ] **Step 3: Implementar** — en `packages/models/src/catalog.ts`:

Añadir `"metaModelApi"` a la unión `ProviderKind` (junto a `"opencodeGo"`):

```ts
export type ProviderKind =
  | "opencodeGo"
  | "metaModelApi"
  | "gateway"
  | "openrouter"
  | "openai"
  | "xai"
  | "groq"
  | "perplexity"
  | "lmstudio";
```

Añadir al final de la sección `// --- userInvocable ---` de `MODEL_CATALOG`:

```ts
{
  id: "Muse Spark 1.2",
  userInvocable: true,
  provider: { kind: "metaModelApi", modelId: "muse-spark-1.2-contributor" },
  company: "meta",
  reasoning: true,
  defaultThinkingLevel: "xhigh",
  thinkingLevelMap: {
    off: null,
    minimal: "minimal",
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "xhigh",
  },
  contextWindow: 1_048_576,
  maxTokens: 131_072,
  cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0.002 },
},
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pnpm --filter models test:unit`
Expected: PASS (32 tests + los nuevos).

- [ ] **Step 5: Type check y commit**

Run: `pnpm --filter models type:check`
Expected: PASS.

```bash
git add packages/models/src/catalog.ts packages/models/src/catalog.test.ts
git commit -m "feat(models): add Muse Spark 1.2 (metaModelApi) to the catalog

New ProviderKind metaModelApi for Meta Model API custom providers and
the Muse Spark 1.2 contributor entry with its full Pi model spec
(context, max tokens, cost, thinkingLevelMap with off: null). Removes
the userInvocable -> opencodeGo invariant test per the 2026-08-09 spec.

Co-Authored-By: Pi Coding Agent <pi@example.com>"
```

---

### Task 2: Mapping — `toPiProviderId`, `CUSTOM_PI_PROVIDERS`, generalización del mapping

**Files:**
- Modify: `packages/models/src/mapping.ts`
- Modify: `packages/models/src/index.ts` (exportar lo nuevo)
- Test: `packages/models/src/mapping.test.ts`

**Interfaces:**
- Consumes: kind `"metaModelApi"` (Task 1).
- Produces:
  - `export const CUSTOM_PI_PROVIDERS: { meta: { baseUrl: "https://api.meta.ai/v1"; api: "openai-completions"; apiKeyEnv: "META_API_KEY" } }` (key = pi provider id).
  - `export function toPiProviderId(kind: ProviderKind): string` — `"opencodeGo" → "opencode-go"`, `"metaModelApi" → "meta"`, resto: throw `Unsupported Pi provider kind: ${kind}`.
  - `toPiModelId` ahora acepta cualquier kind invocable; `toChatModelId` mapea cualquier pi provider del catálogo.

- [ ] **Step 1: Escribir los tests que fallan** — añadir a `packages/models/src/mapping.test.ts`:

```ts
import { toPiProviderId, CUSTOM_PI_PROVIDERS } from "./mapping";

it("maps the Muse Spark catalog id to the meta Pi provider", () => {
  expect(toPiModelId("Muse Spark 1.2")).toEqual({
    providerId: "meta",
    modelId: "muse-spark-1.2-contributor",
  });
});

it("maps the meta Pi provider back to the catalog id", () => {
  expect(toChatModelId("meta", "muse-spark-1.2-contributor")).toBe("Muse Spark 1.2");
  expect(toChatModelId("meta", "unknown-model")).toBeUndefined();
});

it("maps provider kinds to pi provider ids", () => {
  expect(toPiProviderId("opencodeGo")).toBe("opencode-go");
  expect(toPiProviderId("metaModelApi")).toBe("meta");
});

it("exposes the custom pi provider config for meta", () => {
  expect(CUSTOM_PI_PROVIDERS.meta).toEqual({
    baseUrl: "https://api.meta.ai/v1",
    api: "openai-completions",
    apiKeyEnv: "META_API_KEY",
  });
});

it("filters Pi models to the invocable catalog intersection, sorted", () => {
  const result = filterAvailableChatModels([
    { providerId: "meta", modelId: "muse-spark-1.2-contributor" },
    { providerId: "opencode-go", modelId: "deepseek-v4-pro" },
    { providerId: "opencode-go", modelId: "unknown-model" },
  ]);
  expect(result).toEqual(["Deepseek v4 Pro", "Muse Spark 1.2"]);
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `pnpm --filter models test:unit`
Expected: FAIL — `toPiModelId("Muse Spark 1.2")` lanza "Unsupported coding agent model" (el guard de kind solo acepta opencodeGo).

- [ ] **Step 3: Implementar** — reescribir `packages/models/src/mapping.ts`:

```ts
import { MODEL_CATALOG, type InvocableModelId, type ProviderKind } from "./catalog";

export const PI_PROVIDER = "opencode-go";

/**
 * Config de providers custom (no built-in en Pi) que el generador emite en
 * models.json. Key = pi provider id.
 */
export const CUSTOM_PI_PROVIDERS = {
  meta: {
    baseUrl: "https://api.meta.ai/v1",
    api: "openai-completions",
    apiKeyEnv: "META_API_KEY",
  },
} as const;

/** Pi provider id for a catalog provider kind. */
export function toPiProviderId(kind: ProviderKind): string {
  switch (kind) {
    case "opencodeGo":
      return PI_PROVIDER;
    case "metaModelApi":
      return "meta";
    default:
      throw new Error(`Unsupported Pi provider kind: ${kind}`);
  }
}

export function toPiModelId(modelId: InvocableModelId): {
  providerId: string;
  modelId: string;
} {
  const entry = MODEL_CATALOG.find((e) => e.id === modelId && e.userInvocable);
  if (!entry) {
    throw new Error(`Unsupported coding agent model: ${modelId}`);
  }
  return { providerId: toPiProviderId(entry.provider.kind), modelId: entry.provider.modelId };
}

export function toChatModelId(
  providerId: string,
  modelId: string,
): InvocableModelId | undefined {
  const entry = MODEL_CATALOG.find(
    (e) =>
      e.userInvocable &&
      toPiProviderId(e.provider.kind) === providerId &&
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

En `packages/models/src/index.ts`, añadir al export de `./mapping`:

```ts
export {
  CUSTOM_PI_PROVIDERS,
  PI_PROVIDER,
  filterAvailableChatModels,
  toChatModelId,
  toPiModelId,
  toPiProviderId,
} from "./mapping";
```

Nota: los tests existentes `"throws for a non-invocable catalog model"` y `"throws for an unknown model id"` siguen pasando: el throw ahora ocurre cuando la entrada no existe (antes por kind), con el mismo mensaje `Unsupported coding agent model: X`.

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pnpm --filter models test:unit`
Expected: PASS.

- [ ] **Step 5: Type check y commit**

Run: `pnpm --filter models type:check`
Expected: PASS.

```bash
git add packages/models/src/mapping.ts packages/models/src/index.ts packages/models/src/mapping.test.ts
git commit -m "feat(models): generalize pi mapping with toPiProviderId and CUSTOM_PI_PROVIDERS

toPiModelId/toChatModelId now route any invocable kind through
toPiProviderId, and CUSTOM_PI_PROVIDERS carries the baseUrl/api/apiKeyEnv
for custom (non-builtin) Pi providers like meta.

Co-Authored-By: Pi Coding Agent <pi@example.com>"
```

---

### Task 3: Generador — emitir el provider `meta` en `models.json`

**Files:**
- Modify: `packages/models/src/generate-models-json.ts`
- Test: `packages/models/src/generate-models-json.test.ts`

**Interfaces:**
- Consumes: `CUSTOM_PI_PROVIDERS`, `toPiProviderId` (Task 2), entrada "Muse Spark 1.2" (Task 1).
- Produces:
  - `interface PiProviderConfig { baseUrl?: string; api?: string; apiKey?: string; models: PiModelDefinition[] }`
  - `interface PiModelsJson { providers: Record<string, PiProviderConfig> }` (antes solo tenía `models`).
  - `generateModelsJson` agrupa por `toPiProviderId(kind)`; para providers en `CUSTOM_PI_PROVIDERS` emite `{ baseUrl, api, apiKey: "$<apiKeyEnv>", models }`; para el resto `{ models }`.

- [ ] **Step 1: Escribir los tests que fallan** — añadir a `packages/models/src/generate-models-json.test.ts`:

```ts
describe("generateModelsJson custom providers", () => {
  it("emits the meta provider with baseUrl, api and apiKey from CUSTOM_PI_PROVIDERS", () => {
    const providers = generate().providers;
    expect(providers["meta"]).toBeDefined();
    expect(providers["meta"].baseUrl).toBe("https://api.meta.ai/v1");
    expect(providers["meta"].api).toBe("openai-completions");
    expect(providers["meta"].apiKey).toBe("$META_API_KEY");
  });

  it("describes the Muse Spark model fully", () => {
    const [muse] = generate().providers["meta"].models;
    expect(muse).toEqual({
      id: "muse-spark-1.2-contributor",
      name: "Muse Spark 1.2",
      reasoning: true,
      input: ["text"],
      contextWindow: 1_048_576,
      maxTokens: 131_072,
      cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0.002 },
      thinkingLevelMap: {
        off: null,
        minimal: "minimal",
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
      },
    });
  });

  it("keeps the opencode-go provider shape (models only, no provider config)", () => {
    const providers = generate().providers;
    expect(providers["opencode-go"].baseUrl).toBeUndefined();
    expect(providers["opencode-go"].api).toBeUndefined();
    expect(providers["opencode-go"].apiKey).toBeUndefined();
    expect(providers["opencode-go"].models.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `pnpm --filter models test:unit`
Expected: FAIL — `providers["meta"]` es `undefined` (el generador solo emite `opencode-go`).

- [ ] **Step 3: Implementar** — en `packages/models/src/generate-models-json.ts`:

Cambiar los tipos:

```ts
export interface PiProviderConfig {
  /** Solo para providers custom (no built-in en Pi): endpoint de la API. */
  baseUrl?: string;
  /** Solo para providers custom: api flavor de streaming. */
  api?: string;
  /** Solo para providers custom: apiKey con sintaxis de models.json ("$ENV_VAR"). */
  apiKey?: string;
  models: PiModelDefinition[];
}

export interface PiModelsJson {
  providers: Record<string, PiProviderConfig>;
}
```

Reescribir `generateModelsJson`:

```ts
export function generateModelsJson(
  catalog: readonly ModelCatalogEntry[] = MODEL_CATALOG,
  { builtIns }: GenerateModelsJsonOptions = {},
): PiModelsJson {
  const byProvider = new Map<string, PiModelDefinition[]>();
  for (const entry of catalog.filter((e) => e.userInvocable)) {
    const providerId = toPiProviderId(entry.provider.kind);
    const def = buildModelDefinition(entry, builtIns?.get(entry.provider.modelId));
    byProvider.set(providerId, [...(byProvider.get(providerId) ?? []), def]);
  }

  const providers: PiModelsJson["providers"] = {};
  for (const [providerId, models] of byProvider) {
    const custom = CUSTOM_PI_PROVIDERS[providerId as keyof typeof CUSTOM_PI_PROVIDERS];
    providers[providerId] = custom
      ? {
          baseUrl: custom.baseUrl,
          api: custom.api,
          apiKey: `$${custom.apiKeyEnv}`,
          models,
        }
      : { models };
  }
  return { providers };
}
```

Actualizar el import de `./mapping`:

```ts
import { CUSTOM_PI_PROVIDERS, toPiProviderId } from "./mapping";
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pnpm --filter models test:unit`
Expected: PASS (todos los tests existentes + los 3 nuevos).

- [ ] **Step 5: Type check y commit**

Run: `pnpm --filter models type:check`
Expected: PASS.

```bash
git add packages/models/src/generate-models-json.ts packages/models/src/generate-models-json.test.ts
git commit -m "feat(models): emit custom provider config (meta) in models.json

generateModelsJson now groups invocable entries by pi provider id and
emits baseUrl/api/apiKey for providers registered in CUSTOM_PI_PROVIDERS
(meta -> https://api.meta.ai/v1, openai-completions, \$META_API_KEY).

Co-Authored-By: Pi Coding Agent <pi@example.com>"
```

---

### Task 4: Worker — eliminar el filtro de provider en `getAvailableModels`

**Files:**
- Modify: `packages/coding-agent/src/session-manager.ts` (`getAvailableModels`, líneas ~1094-1125)
- Create: `packages/chatbot/tests/unit/agent-code/session-manager-available-models.test.ts`

**Interfaces:**
- Consumes: `generateModelsJson` (Task 3), entrada "Muse Spark 1.2" (Task 1).
- Produces: `getAvailableModels()` devuelve todos los modelos con auth configurada (sin filtrar por provider), cada uno `{ providerId, modelId, label: "<provider>/<modelId>", levels }`.

- [ ] **Step 1: Escribir el test que falla** — crear `packages/chatbot/tests/unit/agent-code/session-manager-available-models.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateModelsJson, type ModelCatalogEntry } from "models";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { getAvailableModels } = await import("coding-agent/session-manager");

const COST = { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 };
const catalog: ModelCatalogEntry[] = [
  {
    id: "Muse Spark 1.2",
    userInvocable: true,
    provider: { kind: "metaModelApi", modelId: "muse-spark-1.2-contributor" },
    company: "meta",
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0.002 },
    thinkingLevelMap: {
      off: null,
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
    },
  },
  {
    id: "Deepseek v4 Pro",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "deepseek-v4-pro" },
    company: "deepseek",
    reasoning: true,
    contextWindow: 128_000,
    maxTokens: 32_000,
    cost: COST,
  },
];

let tmp: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "available-models-"));
  savedEnv.CODING_AGENT_MODELS_JSON = process.env.CODING_AGENT_MODELS_JSON;
  savedEnv.CODING_AGENT_AUTH_JSON = process.env.CODING_AGENT_AUTH_JSON;
  savedEnv.META_API_KEY = process.env.META_API_KEY;
  process.env.CODING_AGENT_MODELS_JSON = path.join(tmp, "models.json");
  process.env.CODING_AGENT_AUTH_JSON = path.join(tmp, "auth.json");
  process.env.META_API_KEY = "test-key";
  writeFileSync(
    process.env.CODING_AGENT_MODELS_JSON,
    JSON.stringify(generateModelsJson(catalog), null, 2),
  );
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("getAvailableModels", () => {
  it("includes custom providers from models.json (meta) with their thinking levels", async () => {
    const models = await getAvailableModels();
    const muse = models.find(
      (m) => m.providerId === "meta" && m.modelId === "muse-spark-1.2-contributor",
    );
    expect(muse).toBeDefined();
    expect(muse?.label).toBe("meta/muse-spark-1.2-contributor");
    expect(muse?.levels).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
  });

  it("hides the meta model when META_API_KEY is not configured", async () => {
    delete process.env.META_API_KEY;
    const models = await getAvailableModels();
    expect(
      models.find((m) => m.providerId === "meta"),
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm --filter chatbot test:unit -- session-manager-available-models`
Expected: FAIL — `muse` es `undefined` (el filtro `provider === "opencode-go"` lo descarta).

- [ ] **Step 3: Implementar** — en `packages/coding-agent/src/session-manager.ts`, dentro de `getAvailableModels`:

```ts
  const authStorage = AuthStorage.create(getAuthJsonPath());
  const registry = ModelRegistry.create(authStorage, getModelsJsonPath());
  const available = registry.getAvailable();
  const filtered = available.map((model) => ({
    providerId: model.provider,
    modelId: model.id,
    label: `${model.provider}/${model.id}`,
    levels: getSupportedThinkingLevels(
      model.reasoning,
      (model as { thinkingLevelMap?: ThinkingLevelMap }).thinkingLevelMap,
    ),
  }));
```

(Único cambio: eliminar la línea `.filter((model) => model.provider === "opencode-go")`. El nombre de la variable `filtered` puede quedarse o renombrarse a `models`; si se renombra, actualizar `log.info("models.result", { count: filtered.length })`.)

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm --filter chatbot test:unit -- session-manager-available-models`
Expected: PASS (los 2 tests).

- [ ] **Step 5: Suite completa y commit**

Run: `pnpm --filter chatbot test:unit`
Expected: PASS (80 files / 475+ tests — el test del lifecycle de `use-coding-agent` usa modelos `opencode-go`, que siguen presentes en el registry).

```bash
git add packages/coding-agent/src/session-manager.ts packages/chatbot/tests/unit/agent-code/session-manager-available-models.test.ts
git commit -m "refactor(coding-agent): drop the opencode-go-only filter in getAvailableModels

The registry already filters by configured auth (hasConfiguredAuth) and
the chatbot filters by catalog mapping (toChatModelId), so the hardcoded
provider filter was redundant and would hide custom providers like meta.

Co-Authored-By: Pi Coding Agent <pi@example.com>"
```

---

### Task 5: Chat — factory `metaModelApi` en providers del chatbot

**Files:**
- Modify: `packages/chatbot/lib/features/foundation-model/types.ts` (interfaz `Providers`)
- Modify: `packages/chatbot/lib/infrastructure/ai/providers.ts`
- Create: `packages/chatbot/tests/unit/foundation-model/muse-spark-config.test.ts`

**Interfaces:**
- Consumes: kind `"metaModelApi"` (Task 1).
- Produces: clave `metaModelApi` en `Providers` (prod: `createOpenAICompatible` con `baseURL: "https://api.meta.ai/v1"` y `apiKey: process.env.META_API_KEY`; test mode: `lookupMock("metaModelApi")`).

- [ ] **Step 1: Escribir los tests que fallan** — crear `packages/chatbot/tests/unit/foundation-model/muse-spark-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chatModelKeys, languageModelConfigurations } from "@/lib/features/foundation-model/config";
import { providers } from "@/lib/infrastructure/ai/providers";

describe("Muse Spark 1.2 in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Muse Spark 1.2");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = languageModelConfigurations("Muse Spark 1.2");
    expect(cfg.company).toBe("meta");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.temperature).toBeUndefined();
    expect(cfg.supportedFiles).toBeUndefined();
  });

  it("exposes a metaModelApi provider factory (mock in test mode)", () => {
    expect(providers.metaModelApi).toBeDefined();
    expect(providers.metaModelApi("muse-spark-1.2-contributor")).toBeDefined();
  });
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `pnpm --filter chatbot test:unit -- muse-spark-config`
Expected: FAIL — `providers.metaModelApi` no existe (TypeError al construir `LANGUAGE_MODEL_CONFIGURATIONS_CONST`: `providers[entry.provider.kind] is not a function`).

- [ ] **Step 3: Implementar**

En `packages/chatbot/lib/features/foundation-model/types.ts`, añadir a la interfaz `Providers` (junto a `opencodeGo`):

```ts
  metaModelApi: (modelId: string) => LanguageModelV3;
```

En `packages/chatbot/lib/infrastructure/ai/providers.ts`:

Junto a `getOpenCodeGo`, añadir:

```ts
let _metaModelApi: ReturnType<typeof createOpenAICompatible> | null = null;

function getMetaModelApi() {
  if (!_metaModelApi) {
    _metaModelApi = createOpenAICompatible({
      name: "meta-model-api",
      apiKey: process.env.META_API_KEY,
      baseURL: "https://api.meta.ai/v1",
    });
  }
  return _metaModelApi;
}
```

En el mapa de prod:

```ts
      opencodeGo: (modelId: string) => getOpenCodeGo()(modelId),
      metaModelApi: (modelId: string) => getMetaModelApi()(modelId),
```

En el mapa de test mode:

```ts
    opencodeGo: lookupMock("opencodeGo"),
    metaModelApi: lookupMock("metaModelApi"),
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pnpm --filter chatbot test:unit -- muse-spark-config`
Expected: PASS (los 3 tests).

- [ ] **Step 5: Type check y commit**

Run: `pnpm --filter chatbot type:check`
Expected: PASS.

```bash
git add packages/chatbot/lib/features/foundation-model/types.ts packages/chatbot/lib/infrastructure/ai/providers.ts packages/chatbot/tests/unit/foundation-model/muse-spark-config.test.ts
git commit -m "feat(chatbot): wire Muse Spark 1.2 chat provider (metaModelApi)

createOpenAICompatible factory pointing at https://api.meta.ai/v1 with
META_API_KEY, mirroring the opencodeGo lazy-singleton pattern.

Co-Authored-By: Pi Coding Agent <pi@example.com>"
```

---

### Task 6: Verificación E2E (manual, sin código)

Prerrequisito: `META_API_KEY=...` en `.env.development.local` (raíz del repo).

- [ ] **Step 1: Smoke test del endpoint de Meta**

```bash
curl -sS -X POST "https://api.meta.ai/v1/chat/completions" \
  -H "Authorization: Bearer $META_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"muse-spark-1.2-contributor","reasoning_effort":"xhigh","messages":[{"role":"user","content":"Reply with exactly: ok"}]}'
```
Expected: 200 con `choices[0].message.content` y `usage` (valida key + modelo + `reasoning_effort: "xhigh"`).

- [ ] **Step 2: Generar y revisar `models.json`**

```bash
cd packages/coding-agent && pnpm exec tsx scripts/generate-models.ts
```
Expected: escribe el models.json apuntado por `CODING_AGENT_MODELS_JSON`; verificar que incluye `providers.meta` con `baseUrl`/`api`/`apiKey`/`models[0].id === "muse-spark-1.2-contributor"` y que `providers["opencode-go"]` sigue solo con `models`.

- [ ] **Step 3: Levantar el worker y comprobar el RPC**

```bash
pnpm dev   # o: pnpm --filter coding-agent transport:http
```
Expected: el log del worker (`models.fetch`/`models.result`) muestra el modelo `meta/muse-spark-1.2-contributor`. Desde el chatbot, el selector de modelos del coding agent muestra "Muse Spark 1.2" con niveles `minimal`–`xhigh` (sin "off").

- [ ] **Step 4: Sesión de coding agent con Muse Spark**

Nueva sesión con modelo "Muse Spark 1.2": el dropdown de razonamiento arranca en `xhigh`; ejecutar una tarea que requiera 2+ tool calls (editar archivo + run) y confirmar streaming, thinking visible y tool calls en loop.

- [ ] **Step 5: Chat con Muse Spark**

Enviar un mensaje con "Muse Spark 1.2" seleccionado; verificar respuesta y que el costo del usage refleja el pricing contributor (input $0.10/M, output $0.20/M) en los traces (si `TRACE_ENABLED=1`).

---

## Self-Review

- **Spec coverage:** Sección 1 → Tasks 1-2 (kind, entrada, mapping, regla de selección). Sección 2 → Tasks 3-4 (generador + worker). Sección 3 → Task 5 (chat), Task 6 (verificación), limitaciones documentadas en la spec (no requieren código; el handler de overflow queda fuera por decisión del usuario).
- **Placeholders:** ninguna — cada paso lleva código concreto, comando y resultado esperado.
- **Type consistency:** `metaModelApi`/`"meta"`/`muse-spark-1.2-contributor`/`toPiProviderId`/`CUSTOM_PI_PROVIDERS`/`PiProviderConfig` se definen una vez (Task 1-2) y se consumen con los mismos nombres en Tasks 3-5.
