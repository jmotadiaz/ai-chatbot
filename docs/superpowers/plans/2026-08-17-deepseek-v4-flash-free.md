# Deepseek v4 Flash (free) vía OpenCode Zen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir "Deepseek v4 Flash (free)" (`deepseek-v4-flash-free`) servido por OpenCode Zen como modelo user-invocable en chat (vía `@ai-sdk/openai-compatible`) y coding agent (vía el provider built-in `opencode` de Pi), sin tocar el "Deepseek v4 Flash" actual.

**Architecture:** Una única entrada en `MODEL_CATALOG` (`packages/models`) con `userInvocable: true` y nuevo `ProviderKind "opencodeZen"`; el chatbot resuelve esa entrada con un provider AI SDK lazy (`createOpenAICompatible`, baseURL `https://opencode.ai/zen/v1`, key `OPENCODE_ZEN_API_KEY`), y el coding agent la resuelve con el provider built-in de Pi `opencode` (auth vía `OPENCODE_API_KEY`, ya en el env del worker). El entry se auto-describe (contextWindow/maxTokens/cost/thinkingLevelMap espejo del built-in de Pi 0.79.3) porque los baselines de `models.json` solo cubren `opencode-go`; `api`/`baseUrl` no se emiten y Pi los hereda del primer built-in del provider (`big-pickle`: `openai-completions` en `https://opencode.ai/zen/v1`, valores idénticos).

**Tech Stack:** TypeScript, pnpm workspaces, AI SDK v6 (`@ai-sdk/openai-compatible`), vitest, Pi (`@earendil-works/pi-coding-agent` 0.79.3).

**Spec:** `docs/superpowers/specs/2026-08-17-deepseek-v4-flash-free-design.md`

## Global Constraints

- Node.js 24 + pnpm 11 (workspace mode). En `src/` no se usa `process.env` directamente: se importa `config` del paquete `config`.
- No se añaden env vars nuevas: chat reusa `OPENCODE_ZEN_API_KEY` (accessor `config.opencodeZenApiKey()`); Pi usa `OPENCODE_API_KEY` (ya presente en `.env.development.local`, misma que usa `opencode-go`).
- Nombres exactos: display id `"Deepseek v4 Flash (free)"`, modelId `"deepseek-v4-flash-free"`, Pi provider `"opencode"`, chat provider key `"opencodeZen"`, chat baseURL `https://opencode.ai/zen/v1` (el SDK añade `/chat/completions`).
- El entry actual "Deepseek v4 Flash" (chat: `deepseek` AI SDK; agent: `opencode-go`/`deepseek-v4-flash`) queda intacto.
- No se modifica `packages/coding-agent` ni `packages/model-registry` (este último no tiene consumidores).
- El pre-commit hook del repo ejecuta el verify completo (lint/type-check/unit/component/integration/contract): el working tree debe estar verde en el momento del commit.
- Commits de IA incluyen: `Co-Authored-By: Claude <noreply@anthropic.com>`.
- El working tree tiene cambios **preexistentes y no commitados** de la feature "Qwen 3.8 27B" en `packages/models/src/catalog.ts`, `catalog.test.ts` y `generate-models-json.test.ts`. No revertirlos; las ediciones de este plan se superponen sin solaparse con esos hunks. En el paso de commit, stagear solo los hunks de este plan (ver nota del Task 1, paso 7).

## File Structure

| Archivo | Rol en este cambio |
| --- | --- |
| `packages/models/src/catalog.ts` | Añadir `"opencodeZen"` a `ProviderKind` y la entrada "Deepseek v4 Flash (free)" en `MODEL_CATALOG` (fuente única de verdad). |
| `packages/models/src/mapping.ts` | Mapear `"opencodeZen"` → `"opencode"` en `toPiProviderId`. |
| `packages/models/src/catalog.test.ts` | Invariante: lista exacta de `INVOCABLE_MODEL_IDS`. |
| `packages/models/src/generate-models-json.test.ts` | Test de la forma emitida del nuevo modelo bajo `providers["opencode"]`. |
| `packages/chatbot/lib/features/foundation-model/types.ts` | `Providers` interface: nueva key `opencodeZen`. |
| `packages/chatbot/lib/infrastructure/ai/providers.ts` | Provider AI SDK lazy `opencodeZen` (ramas prod y test). |

Nota de acoplamiento: añadir `"opencodeZen"` a `ProviderKind` rompe el type-check del chatbot hasta que la key exista en `Providers` (indexación `providers[entry.provider.kind]` en `lib/features/foundation-model/config.ts`). Por eso todo va en **un solo commit**.

---

### Task 1: Modelo "Deepseek v4 Flash (free)" end-to-end (catálogo + mapeo Pi + provider chat)

**Files:**
- Modify: `packages/models/src/catalog.ts` (ProviderKind ~línea 15; entrada tras "Deepseek v4 Flash" ~línea 86)
- Modify: `packages/models/src/mapping.ts` (`toPiProviderId`, ~línea 7)
- Modify: `packages/models/src/catalog.test.ts` (test "exposes exactly the coding-agent models as invocable, in order")
- Modify: `packages/models/src/generate-models-json.test.ts` (nuevo describe al final del archivo)
- Modify: `packages/chatbot/lib/features/foundation-model/types.ts` (`Providers`, ~línea 66)
- Modify: `packages/chatbot/lib/infrastructure/ai/providers.ts` (bloques de providers, ramas prod ~línea 70 y test ~línea 113)

**Interfaces:**
- Consumes: `config.opencodeZenApiKey()` (paquete `config`, retorna `string | undefined`), `createOpenAICompatible` de `@ai-sdk/openai-compatible`, `lookupMock` (ya existe en `providers.ts`).
- Produces: `ProviderKind` incluye `"opencodeZen"`; `MODEL_CATALOG` incluye la entrada `{ id: "Deepseek v4 Flash (free)", userInvocable: true, provider: { kind: "opencodeZen", modelId: "deepseek-v4-flash-free" }, ... }`; `Providers.opencodeZen: (modelId: string) => LanguageModelV3`.

- [ ] **Step 1: Escribir los tests fallando (models)**

En `packages/models/src/catalog.test.ts`, en el test "exposes exactly the coding-agent models as invocable, in order", insertar `"Deepseek v4 Flash (free)"` entre `"Deepseek v4 Flash"` y `"Deepseek v4 Pro"`:

```ts
    expect([...INVOCABLE_MODEL_IDS]).toEqual([
      "Deepseek v4 Flash",
      "Deepseek v4 Flash (free)",
      "Deepseek v4 Pro",
      "Kimi K2.7 Code",
      // ... resto sin cambios
```

Al final de `packages/models/src/generate-models-json.test.ts` (tras el describe "generateModelsJson custom providers"), añadir:

```ts
describe("generateModelsJson opencode zen (free) model", () => {
  it("emits deepseek-v4-flash-free under the built-in opencode provider, fully self-described", () => {
    // Pi trae el modelo built-in (provider "opencode"), pero los baselines
    // solo cubren opencode-go: la entrada se auto-describe y sobrevive con
    // builtIns vacías.
    const entry = MODEL_CATALOG.find((e) => e.id === "Deepseek v4 Flash (free)")!;
    const [model] = generateModelsJson([entry], { builtIns: new Map() })
      .providers["opencode"].models;
    expect(model).toEqual({
      id: "deepseek-v4-flash-free",
      name: "Deepseek v4 Flash (free)",
      reasoning: true,
      input: ["text"],
      contextWindow: 200_000,
      maxTokens: 128_000,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      thinkingLevelMap: {
        minimal: null,
        low: null,
        medium: null,
        high: "high",
        xhigh: "max",
      },
    });
  });
});
```

(Importes ya presentes en ese archivo: `generateModelsJson`, `MODEL_CATALOG`.)

- [ ] **Step 2: Correr los tests para confirmar que fallan**

Run: `pnpm --filter models test:unit`
Expected: 2 fallos —
1. `catalog.test.ts` "exposes exactly the coding-agent models as invocable, in order": la lista real no contiene `"Deepseek v4 Flash (free)"`.
2. `generate-models-json.test.ts` "opencode zen (free) model": `TypeError` (o `Cannot read properties of undefined`) porque `generate().providers["opencode"]` no existe y el `find` devuelve `undefined`.

- [ ] **Step 3: Implementar en `packages/models`**

`packages/models/src/catalog.ts` — añadir `"opencodeZen"` a `ProviderKind` (tras `"opencodeGo"`):

```ts
export type ProviderKind =
  | "opencodeGo"
  | "opencodeZen"
  | "gateway"
  | "openrouter"
  | "openai"
  | "xai"
  | "groq"
  | "perplexity"
  | "lmstudio"
  | "deepinfra";
```

`packages/models/src/catalog.ts` — nueva entrada en `MODEL_CATALOG`, justo después de la entrada `{ id: "Deepseek v4 Flash", ... }` y antes de `{ id: "Deepseek v4 Pro", ... }`:

```ts
  {
    // Variante free servida por OpenCode Zen (provider "opencode" built-in
    // de Pi). Los baselines solo cubren opencode-go, así que la entrada se
    // describe a sí misma: valores espejo de la definición built-in de
    // Pi 0.79.3.
    id: "Deepseek v4 Flash (free)",
    userInvocable: true,
    provider: { kind: "opencodeZen", modelId: "deepseek-v4-flash-free" },
    company: "deepseek",
    reasoning: true,
    defaultThinkingLevel: "xhigh",
    thinkingLevelMap: {
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: "max",
    },
    contextWindow: 200_000,
    maxTokens: 128_000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    temperature: 1,
    topP: 0.95,
  },
```

`packages/models/src/mapping.ts` — nuevo case en `toPiProviderId` (tras `case "opencodeGo"`):

```ts
    case "opencodeZen":
      // Pi trae OpenCode Zen como provider built-in "opencode" (env
      // OPENCODE_API_KEY, la misma que opencode-go).
      return "opencode";
```

- [ ] **Step 4: Correr tests y type-check de `models`**

Run: `pnpm --filter models test:unit && pnpm --filter models type:check`
Expected: PASS (todos los tests de models, sin errores de tipos).

Nota: en este punto el type-check del chatbot está roto a propósito (`ProviderKind` incluye `"opencodeZen"` pero `Providers` aún no). No commitear hasta completar el Step 6.

- [ ] **Step 5: Añadir la key `opencodeZen` en el chatbot**

`packages/chatbot/lib/features/foundation-model/types.ts` — en `interface Providers`, tras la línea `opencodeGo: (modelId: string) => LanguageModelV3;`:

```ts
  opencodeZen: (modelId: string) => LanguageModelV3;
```

`packages/chatbot/lib/infrastructure/ai/providers.ts` — provider lazy, justo después del bloque `getOpenCodeGo()` (líneas 24–35):

```ts
let _opencodeZen: ReturnType<typeof createOpenAICompatible> | null = null;

function getOpenCodeZen() {
  if (!_opencodeZen) {
    _opencodeZen = createOpenAICompatible({
      name: "opencode-zen",
      apiKey: config.opencodeZenApiKey(),
      baseURL: "https://opencode.ai/zen/v1",
    });
  }
  return _opencodeZen;
}
```

Cableado en la rama prod (tras `opencodeGo: (modelId: string) => getOpenCodeGo()(modelId),`):

```ts
      opencodeZen: (modelId: string) => getOpenCodeZen()(modelId),
```

Cableado en la rama test (tras `opencodeGo: lookupMock("opencodeGo"),`):

```ts
    opencodeZen: lookupMock("opencodeZen"),
```

- [ ] **Step 6: Verificar el chatbot**

Run: `pnpm --filter chatbot type:check && pnpm --filter chatbot test:unit`
Expected: PASS (type-check limpio; los 216+ tests unit existentes siguen pasando — la rama test resuelve el nuevo provider vía `lookupMock`/`createMockModel` genéricos).

- [ ] **Step 7: Verify completo + commit**

Run: `pnpm verify:fast`
Expected: PASS en todos los paquetes (models, chatbot, coding-agent, config, tracing).

Commit (stagear **solo** los hunks de este plan; los 3 archivos de `packages/models` contienen además los hunks preexistentes de "Qwen 3.8 27B" que NO se stagean):

```bash
git add packages/models/src/mapping.ts \
        packages/chatbot/lib/features/foundation-model/types.ts \
        packages/chatbot/lib/infrastructure/ai/providers.ts
git add -p packages/models/src/catalog.ts \
           packages/models/src/catalog.test.ts \
           packages/models/src/generate-models-json.test.ts
# En cada prompt de git add -p, stagear únicamente los hunks de
# "Deepseek v4 Flash (free)" / "opencodeZen" (s, s, n...); los hunks de
# "Qwen 3.8 27B" se dejan fuera (n).
git status   # revisar el diff staged antes de commitear
git commit -m "feat(models,chatbot): add Deepseek v4 Flash (free) via OpenCode Zen

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Si los hunks preexistentes de "Qwen 3.8 27B" se han commitado ya (o el usuario prefiere commitearlos juntos), `git add` completo de los 6 archivos es suficiente.

---

## Self-Review (hecho al escribir el plan)

1. **Spec coverage:** entry de catálogo (Task 1 step 3) ✓; `toPiProviderId` (step 3) ✓; provider chat con key y baseURL correctos (step 5) ✓; tests de invariante y de forma emitida (step 1) ✓; "no cambios en coding-agent/model-registry/env" (Global Constraints) ✓; user-invocable en ambos selectores (consecuencia de `userInvocable: true` + mapeo) ✓.
2. **Placeholder scan:** sin TBD/TODO; todo el código está literal en el plan.
3. **Type consistency:** `"opencodeZen"` idéntico en `ProviderKind`, `Providers` y `lookupMock`; `"deepseek-v4-flash-free"` idéntico en entry y test; metadatos del test idénticos a los del entry (200_000/128_000/coste 0/thinkingLevelMap).
