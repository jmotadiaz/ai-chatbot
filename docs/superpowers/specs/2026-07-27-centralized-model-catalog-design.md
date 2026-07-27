# Diseño: Catálogo centralizado de modelos (`packages/models`)

**Fecha:** 2026-07-27
**Estado:** Aprobado por el usuario

## Contexto y problema

Actualizar la lista de modelos impacta hoy a múltiples lugares del monorepo:

1. **chatbot** — archivos de config por compañía (`lib/features/foundation-model/*.ts`) con el `piModelId` embebido en `providers.opencodeGo("...")`.
2. **chatbot** — `chatModelKeys` en `config.ts` (los 23 modelos del selector).
3. **chatbot** — `CHAT_TO_PI` en `lib/features/code/model-mapping.ts` (mapping display name → pi model id).
4. **coding-agent** — el `models.json` que lee Pi's `ModelRegistry` (fuera del repo, en el agent dir).

El `piModelId` existe en 3 sitios a la vez (config por compañía, `CHAT_TO_PI`, y el `models.json` de Pi), pudiendo divergir.

### Hallazgos de la auditoría

- El coding-agent obtiene sus modelos de Pi's `ModelRegistry`, que lee `models.json` del agent dir por defecto. `ModelRegistry.create(authStorage, path)` acepta un path explícito, y `createAgentSessionServices` acepta `options.modelRegistry` inyectable.
- El schema TypeBox de Pi: `{ providers: { "<provider>": { name?, baseUrl?, apiKey?, api?, models?: [{ id, name?, reasoning?, input?, cost?, contextWindow?, maxTokens?, ... }] } } }`.
- `LANGUAGE_MODEL_CONFIGURATIONS_CONST` contiene **más** modelos que `chatModelKeys`: hay modelos internos no seleccionables ("Llama 3.1 Instant", "GPT OSS Mini", "Nano Banana", "Gemini 2.5 Flash Lite") usados por `english/workflows`, `memory`, `image`, `meta-prompt`, `web-search`, `chat/utils`.
- Embeddings (`gemini-embedding-001`) y rerank (`cohere rerank-v4.0-pro`) son singletons a nivel provider en `lib/infrastructure/ai/providers.ts`, nunca fueron configs por modelo.
- Los `modelId` (display names como "Deepseek v4 Pro") se persisten en DB (chats, sesiones de coding-agent).
- El coding-agent corre con `tsx` (no tiene paso de build real); sus scripts son `dev`/`start` → `transport:http`.

## Decisiones de diseño

| Decisión | Elección |
| --- | --- |
| Enfoque | Package nuevo `packages/models` con datos puros (sin AI SDK) + generador + helpers (Opción A) |
| Fuente de verdad | El catálogo compartido genera el `models.json` de Pi; la disponibilidad sigue siendo runtime (Pi registry) |
| Alcance del catálogo | **Todos** los modelos actuales (23 seleccionables + internos). Nada se elimina |
| Regla de selección | `userInvocable: boolean` es la **única** condición: define el selector del chat **y** el contenido de `models.json` |
| Soporte de coding-agent | Invariante: `userInvocable === true` ⟹ `provider.kind === "opencodeGo"` (validado por test, no usado como filtro) |
| Generación de models.json | Como paso de arranque: `predev`/`prestart` del coding-agent (equivalente al "paso de build" dado que corre con `tsx`) |

## Arquitectura

```
chatbot ──────→ models
coding-agent ─→ models
```

`packages/models` sigue el patrón de `tracing`: nombre simple `models`, consumido como `workspace:*`, datos puros sin dependencias de AI SDK.

## Componentes

### `packages/models`

**`src/catalog.ts`** — única fuente de verdad:

```ts
export interface ModelCatalogEntry {
  id: string;                    // display name ("Deepseek v4 Pro") — estable, se persiste en DB
  userInvocable: boolean;        // aparece en selectores (chat + coding agent) y genera models.json
  provider:                      // datos puros, sin AI SDK
    | { kind: "opencodeGo"; modelId: string }
    | { kind: "gateway" | "openrouter" | "openai" | "xai"
              | "groq" | "perplexity" | "lmstudio"; modelId: string };
  company: Company;              // union type, se mueve desde chatbot/foundation-model/types.ts
  reasoning: boolean;
  temperature?: number;
  topP?: number;
  topK?: number;
  contextWindow?: number;
  maxTokens?: number;            // lo consume Pi
  supportedFiles: Array<"pdf" | "img">;
  supportedOutput: Array<"text" | "img">;
  providerOptions?: Record<string, unknown>; // passthrough opaco (thinking, zeroDataRetention…)
}

export const MODEL_CATALOG: readonly ModelCatalogEntry[];
```

Notas:

- `piModelId` no existe como campo separado: es `provider.modelId` cuando `kind === "opencodeGo"`. Imposible que diverja del mapping.
- El catálogo inicial contiene los 23 modelos seleccionables actuales (6 con `userInvocable: true` — los del `CHAT_TO_PI` actual — y 17 con `userInvocable: false`) más los internos (`userInvocable: false`).
- Embeddings y rerank **no** entran al catálogo: permanecen en `providers.ts` del chatbot.

**`src/mapping.ts`** — `PI_PROVIDER = "opencode-go"`, `toPiModelId`, `toChatModelId`, `filterAvailableChatModels` (movidos desde `chatbot/lib/features/code/model-mapping.ts`).

**`src/generate-models-json.ts`** — `generateModelsJson(catalog)`: emite el schema de Pi a partir de `catalog.filter(e => e.userInvocable)`, con `id = provider.modelId`, `name = id`, y los campos `reasoning`, `contextWindow`, `maxTokens`, e `input = ["text", ...(supportedFiles.includes("img") ? ["image"] : [])]`.

**`src/generate-cli.ts`** — CLI que escribe el JSON a un path recibido por argumento (o env). Lo invoca el coding-agent.

**`src/index.ts`** — exports públicos.

### `packages/chatbot` — consumidor

- `lib/features/foundation-model/config.ts`:
  - `chatModelKeys` = `MODEL_CATALOG.filter(e => e.userInvocable).map(e => e.id)` (derivado; el tipo `chatModelId` y el resto de la API pública se mantienen).
  - `LANGUAGE_MODEL_CONFIGURATIONS_CONST` se deriva del catálogo: `model: providers[entry.provider.kind](entry.provider.modelId)`, resto de campos copia directa; `providerOptions` se castea a `ProviderOptions`.
- Los archivos por compañía (`alibaba.ts`, `anthropic.ts`, `deepseek.ts`, `google.ts`, `meta.ts`, `minimax.ts`, `mistral.ts`, `moonshotai.ts`, `nvidia.ts`, `openai.ts`, `perplexity.ts`, `stepfun.ts`, `xai.ts`, `xiaomi.ts`, `zai.ts`) se eliminan: su contenido migra al catálogo.
- `Company` se importa desde `models` (re-export si conviene para minimizar diffs).
- `lib/features/code/model-mapping.ts` se borra; sus consumidores (`app/(chat)/api/agent/code/route.ts`, tests) importan desde `models`.
- Los usos internos por clave (`english`, `memory`, `image`, `meta-prompt`, `web-search`, `chat/utils`, evals) **no cambian**: sus modelos permanecen en el catálogo.

### `packages/coding-agent` — consumidor

- `src/models.ts` (nuevo): `getModelsJsonPath()` → `process.env.CODING_AGENT_MODELS_JSON ?? join(getAgentDir(), "models.json")`.
- `package.json`: `predev` y `prestart` ejecutan el CLI generador escribiendo a `getModelsJsonPath()`.
- `session-manager.ts`:
  - `makeCreateRuntime`: construye `AuthStorage` + `ModelRegistry.create(authStorage, getModelsJsonPath())` y los inyecta vía `createAgentSessionServices({ ..., authStorage, modelRegistry })`.
  - `getAvailableModels`: usa `ModelRegistry.create(authStorage, getModelsJsonPath())`.

## Flujo de datos

### Añadir un modelo invocable

1. Añadir entrada al `MODEL_CATALOG` (`userInvocable: true`, `provider: { kind: "opencodeGo", modelId }`).
2. El `predev`/`prestart` del coding-agent regenera `models.json` antes de levantar el worker.
3. Chatbot: selector, mapping y configs se derivan automáticamente. Cero toques adicionales.
4. El test de integridad valida el invariante en CI.

### Disponibilidad en runtime (sin cambios conceptuales)

Worker devuelve los modelos disponibles del registry de Pi → chatbot los intersecta con el catálogo (`filterAvailableChatModels`) → el selector del coding-agent muestra la intersección.

## Manejo de errores

- **`models.json` ausente**: el `prestart` lo hace prácticamente imposible en flujo normal; si ocurre, Pi degrada a registry vacío y los logs del worker ya lo reflejan.
- **`toPiModelId` con modelo no soportado**: lanza `Unsupported coding agent model` (comportamiento actual, manejado por la ruta API).
- **IDs stale en DB**: se mantiene el patrón de fallback existente (`|| languageModelConfigurations(chatModelKeys[0])` en router/factory/ai-adapter). Al no eliminar modelos del catálogo, los chats existentes siguen cargando su config.
- **JSON generado inválido**: test unitario valida la estructura contra el shape del schema TypeBox de Pi.

## Testing

- **`packages/models`** (vitest):
  - Integridad del catálogo: ids únicos, `provider.modelId` únicos por kind, invariante `userInvocable → opencodeGo`.
  - Roundtrip de mapping (`toPiModelId`/`toChatModelId`), incluido error en modelo no soportado.
  - Snapshot/validación estructural del `models.json` generado.
- **chatbot**: los tests de `model-mapping.test.ts` se mueven a `packages/models`. El resto de tests deben pasar sin cambios (las configs internas no se rompen).
- **coding-agent**: test de que `getAvailableModels` y la creación de runtime usan el path resuelto (env override).

## Fuera de alcance

- Cambios en embeddings/rerank (permanecen en `providers.ts`).
- Sincronización de `cost` de modelos en el `models.json` (Pi usa defaults si se omite; puede añadirse al catálogo más adelante).
- Migración de datos en DB (no necesaria: los display names se mantienen estables).
