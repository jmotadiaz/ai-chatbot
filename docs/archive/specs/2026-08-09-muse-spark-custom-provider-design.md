# Diseño: Muse Spark (Meta Model API) como primer custom provider de Pi

**Fecha:** 2026-08-09
**Estado:** Aprobado por el usuario (2026-08-09)

## Contexto y problema

Incluir **Muse Spark 1.2** (Meta Model API, tier contributor) como modelo del
chatbot y del coding agent. Es el primer modelo que Pi no trae built-in: todos los modelos
actuales se sirven vía el provider `opencode-go` (built-in en Pi, con `baseUrl`/`api`/`apiKey`
heredados de su definición interna). Muse Spark requiere registrar un **custom provider**
(`meta`) con endpoint, API y key propios.

### Datos verificados de Meta Model API

| Dato | Valor |
| --- | --- |
| Base URL (OpenAI-compatible) | `https://api.meta.ai/v1` |
| Model ID contributor tier | `muse-spark-1.2-contributor` |
| Auth | `Authorization: Bearer` (`META_API_KEY`) |
| Context window | 1,048,576 tokens |
| Max output | 131,072 tokens |
| Precio contributor (por 1M tokens) | input $0.10, output $0.20, cached input $0.002 |
| Rate limits contributor | 100 RPM / 3M TPM por equipo |
| Reasoning | Siempre razona; `reasoning_effort`: `minimal`–`xhigh`; `"none"` → HTTP 400 |
| Roles | `developer` (preferido), `system` aceptado, `tool` con `tool_call_id` |
| No soportado (400) | `stop`, `n>1`, `verbosity`, `logit_bias`, `prediction`, `modalities`, named `tool_choice` |
| Sí soporta | `store`, `stream_options.include_usage`, `strict` en tools, `parallel_tool_calls`, `max_completion_tokens`, `prompt_cache_retention` |

### Protocolo elegido: `openai-completions`

- Pi envía `reasoning_effort` top-level vía `thinkingLevelMap`, `developer` role,
  `max_completion_tokens` y `stream_options` — todo soportado por Meta. Los compat flags
  auto-detectados de Pi para un provider con `baseUrl: api.meta.ai` ya son correctos; no hace
  falta emitir `compat` alguno.
- Descartadas: `anthropic-messages` (fricción con auth Bearer, thinking budget vs effort,
  replay de `redacted_thinking`) y `openai-responses` (Pi no reenvía reasoning cifrado).
- **Trade-off aceptado**: Chat Completions no lleva el razonamiento entre turns; cada turno
  del loop de herramientas re-razona desde cero.

## Decisiones del usuario (brainstorming)

| Decisión | Elección |
| --- | --- |
| Alcance | **B** — Muse Spark aparece en el selector de chat **y** en el del coding agent (`userInvocable: true`) |
| Handler de overflow (`message_end`) | **No incluirlo** por ahora; documentar la limitación (ver Limitaciones) |
| `defaultThinkingLevel` | `xhigh` |
| Enfoque | **A** — extender catálogo + generador + mapping + worker + factory de chat (fuente de verdad única) |

## Arquitectura

Sin cambios topológicos: chatbot y coding-agent siguen derivando del catálogo
(`packages/models`). La novedad es que el `models.json` generado pasa de un solo provider
(`opencode-go`) a dos (`opencode-go` + `meta`), y el provider `meta` lleva su propia
`baseUrl`/`api`/`apiKey` porque Pi no lo conoce.

```
MODEL_CATALOG ──→ generateModelsJson ──→ models.json (providers: opencode-go, meta) ──→ Pi registry
      │
      └──→ config.ts / providers.ts (chat, vía AI SDK con META_API_KEY)
```

## Sección 1 — Modelo de datos y catálogo (APROBADA)

### 1.1 Nuevo `ProviderKind` en `packages/models/src/catalog.ts`

```ts
export type ProviderKind =
  | "opencodeGo"
  | "metaModelApi"   // ← nuevo: Meta Model API (custom provider en Pi)
  | "gateway" | "openrouter" | "openai" | "xai" | "groq" | "perplexity" | "lmstudio";
```

### 1.2 Nueva entrada en `MODEL_CATALOG` (sección `userInvocable`)

```ts
{
  id: "Muse Spark 1.2",             // display name; "contributor" es solo detalle de facturación
  userInvocable: true,
  provider: { kind: "metaModelApi", modelId: "muse-spark-1.2-contributor" }, // el id de la API de Meta sí lleva el sufijo
  company: "meta",
  reasoning: true,
  defaultThinkingLevel: "xhigh",
  thinkingLevelMap: {
    off: null,                      // Muse no permite desactivar reasoning (400)
    minimal: "minimal", low: "low", medium: "medium",
    high: "high", xhigh: "xhigh",   // → reasoning_effort de Meta
  },
  contextWindow: 1_048_576,
  maxTokens: 131_072,
  cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0.002 },
}
```

Notas:

- El `id` del catálogo (display name) es "Muse Spark 1.2"; el sufijo `-contributor` solo
existe en `provider.modelId`, que es el id que exige la API de Meta. Si más adelante se
añade el tier standard, será otra entrada (`provider.modelId: "muse-spark-1.2"`).
- Sin `temperature`/`topP`: Meta recomienda dejar el sampling sin tocar (default 1.0).
- Sin `supportedFiles`: primera integración solo texto (imágenes después = una línea).
- `thinkingLevelMap` con `off: null` oculta el nivel "off" de las UIs (dropdown del coding
  agent y Pi) y es obligatorio: Pi enviaría `reasoning_effort: "none"` → 400.

### 1.3 Config del provider Pi en `packages/models/src/mapping.ts`

```ts
export const PI_PROVIDER = "opencode-go";

/** Config de providers custom (no built-in en Pi) que el generador emite en models.json. */
export const CUSTOM_PI_PROVIDERS = {
  meta: { baseUrl: "https://api.meta.ai/v1", api: "openai-completions", apiKeyEnv: "META_API_KEY" },
} as const;

export function toPiProviderId(kind: ProviderKind): string {
  // "opencodeGo" → "opencode-go", "metaModelApi" → "meta"
}
```

- `toPiModelId("Muse Spark 1.2")` → `{ providerId: "meta", modelId: "muse-spark-1.2-contributor" }`
- `toChatModelId("meta", "muse-spark-1.2-contributor")` → `"Muse Spark 1.2"`
- `filterAvailableChatModels` no cambia (ya pasa por `toChatModelId`).

### 1.4 Regla de selección: solo `userInvocable`

La spec de 2026-07-27 añadió la restricción `userInvocable === true ⟹ provider.kind === "opencodeGo"`
(validada por test). Esta spec **elimina esa restricción**: `userInvocable` es la única
condición (como ya decía la regla de selección original del catálogo) y no se ata a ningún
provider kind concreto.

`catalog.test.ts` elimina el test del invariante kind==opencodeGo; además, los modelos con
kind `metaModelApi` **deben** declarar `contextWindow`, `maxTokens`, `cost` y
`thinkingLevelMap` (el generador ya lanza error si faltan).

## Sección 2 — Generación y worker (APROBADA)

### 2.1 `packages/models/src/generate-models-json.ts`

- El tipo `PiModelsJson` admite campos opcionales a nivel provider: `baseUrl?`, `api?`,
  `apiKey?` (hoy solo emite `models`).
- `generateModelsJson` agrupa los entries `userInvocable` por `toPiProviderId(kind)`:
  - **`opencode-go`**: se emite igual que hoy (solo `models`; el resto lo hereda del
    built-in de Pi).
  - **`meta`**: se emite `{ baseUrl, api, apiKey: "$META_API_KEY", models }` tomado de
    `CUSTOM_PI_PROVIDERS`.
- `buildModelDefinition` no cambia su lógica: para `muse-spark-1.2-contributor` no hay
  baseline de Pi, así que la entrada del catálogo ya declara `contextWindow`/`maxTokens`/
  `cost`/`thinkingLevelMap` (sin eso, el error existente ya la rechaza). `api`/`baseUrl` a
  nivel modelo se omiten: Pi los hereda del provider.

Resultado en `models.json` (bloque validado contra Pi y Meta en el análisis previo):

```json
{
  "providers": {
    "opencode-go": { "models": [ …igual que hoy, sin cambios… ] },
    "meta": {
      "baseUrl": "https://api.meta.ai/v1",
      "api": "openai-completions",
      "apiKey": "$META_API_KEY",
      "models": [{
        "id": "muse-spark-1.2-contributor",
        "name": "Muse Spark 1.2",
        "reasoning": true,
        "thinkingLevelMap": { "off": null, "minimal": "minimal", "low": "low", "medium": "medium", "high": "high", "xhigh": "xhigh" },
        "input": ["text"],
        "contextWindow": 1048576,
        "maxTokens": 131072,
        "cost": { "input": 0.1, "output": 0.2, "cacheRead": 0.002, "cacheWrite": 0.002 }
      }]
    }
  }
}
```

`scripts/generate-models.ts` del coding-agent **no cambia**: sigue llamando
generateModelsJson con los baselines de `opencode-go`, y ahora escribe el provider `meta`
adicional.

### 2.2 `packages/coding-agent/src/session-manager.ts` — `getAvailableModels()`

Hoy filtra hardcodeado `model.provider === "opencode-go"` (línea ~1104). Ese filtro se
**elimina**: es redundante y dañino tras esta spec.

- **Redundante**: `registry.getAvailable()` ya devuelve solo modelos con auth configurada
  (`hasConfiguredAuth`: auth.json o apiKey del provider resoluble), y el chatbot ya filtra
  con `toChatModelId(...) !== undefined` — solo sobreviven modelos del catálogo.
- **Dañino**: ocultaría el provider `meta` (y cualquier provider futuro). Con la regla de
  selección "solo `userInvocable`", el mapeo a catálogo es el único filtro válido.

Cambio: eliminar el `.filter(...)` y dejar pasar todos los modelos disponibles:

```ts
const available = registry.getAvailable();
const filtered = available.map((model) => ({ ... }));
```

- `label` pasa a ser `"meta/muse-spark-1.2-contributor"` (formato `provider/modelId` que ya
  usa `createSession` y el chatbot).
- `levels` salen de Pi vía `thinkingLevelMap` → `["minimal", "low", "medium", "high", "xhigh"]`
  (sin "off").
- Efecto lateral: la respuesta del RPC incluye ahora modelos de otros providers built-in con
  key configurada (anthropic, openai, …); el chatbot los descarta vía `toChatModelId`. A
  cambio, añadir un provider futuro no requiere tocar el worker.
- Nota: si `META_API_KEY` no está en el env del worker, `hasConfiguredAuth` es falso y el
  modelo no aparece en la lista (comportamiento deseado: oculto hasta tener key).
- `createSession`/`makeCreateRuntime` no cambian: reciben `"meta/muse-spark-1.2-contributor"`
  y Pi lo resuelve contra el registry (que ya leyó `models.json`).

## Sección 3 — Chat, tests y limitaciones (APROBADA)

### 3.1 Chat — `packages/chatbot/lib/infrastructure/ai/providers.ts`

El catálogo alimenta `LANGUAGE_MODEL_CONFIGURATIONS_CONST`, que llama
`providers[entry.provider.kind]` para todos los entries — sin factory, el build revienta
(TypeScript lo fuerza: `ProviderKind` es unión cerrada). Añadir:

```ts
const metaModelApi = createOpenAICompatible({
  name: "meta-model-api",
  apiKey: process.env.META_API_KEY,
  baseURL: "https://api.meta.ai/v1",
});
```

- Clave `metaModelApi` en el mapa `providers` (modo prod y test mode — en test mode el
  `lookupMock` ya es genérico sobre `MODEL_CATALOG`; cae a `createMockModel` si no hay mock
  dedicado).
- Sin `providerOptions`: el chat usa el reasoning default de Meta (medium); el `xhigh`
  aplica al coding agent vía Pi. YAGNI.

### 3.2 Tests

| Archivo | Cambio |
| --- | --- |
| `packages/models/src/catalog.test.ts` | Eliminar el invariante `userInvocable → opencodeGo`; validar que los entries `metaModelApi` declaran `contextWindow`/`maxTokens`/`cost`/`thinkingLevelMap` |
| `packages/models/src/mapping.test.ts` | `toPiModelId`/`toChatModelId` con `metaModelApi`; `toPiProviderId` |
| `packages/models/src/generate-models-json.test.ts` | El JSON generado incluye el provider `meta` completo (baseUrl/api/apiKey/models) |
| tests unit del worker (chatbot/tests/unit/agent-code) | No existe test de `getAvailableModels`; el cambio queda cubierto por los tests de models (mapping/generador) y por verificación manual del RPC |

### 3.3 Limitaciones (known issues)

1. **Sin auto-compactación en overflow** (decisión del usuario): el error de Meta ("the
   model's context length is only …") no coincide con los patrones de overflow de Pi;
   sesiones largas pueden fallar al llenar contexto. Mitigación futura: handler `message_end`
   en una extensión del worker.
2. **Reasoning no desactivable**: el nivel "off" desaparece de las UIs (inherente al modelo).
3. **Sin continuidad de reasoning entre turns** (Chat Completions): cada turno del loop
   re-razona desde cero.
4. **Rate limits contributor**: 100 RPM / 3M TPM por equipo (compartido con el chat si usan
   la misma key).
5. **Datos usados para entrenar modelos de Meta**: trade-off del tier contributor.
6. **`META_API_KEY` ausente** → el modelo no aparece en los selectores (auth no configurada;
   `hasConfiguredAuth` resuelve el apiKey del provider en models.json).

### 3.4 Env

`META_API_KEY=...` en `.env.development.local` (raíz). El worker lo resuelve vía
`dotenv -e .env.development.local` (scripts `dev`/`start`); el chatbot lo lee del mismo file
vía Next.
