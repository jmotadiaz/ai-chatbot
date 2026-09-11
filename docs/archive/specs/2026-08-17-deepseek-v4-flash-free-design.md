# Diseño: Deepseek v4 Flash (free) vía OpenCode Zen

**Fecha:** 2026-08-17 · **Estado:** borrador

## Contexto

Añadir el modelo **DeepSeek V4 Flash Free** (`deepseek-v4-flash-free`) servido por el
provider **OpenCode Zen** (endpoint `https://opencode.ai/zen/v1/chat/completions`,
OpenAI-compatible), reutilizando la API key que ya usa opencode go en el chatbot
(`OPENCODE_ZEN_API_KEY`). Debe ser **user invocable** y es **adicional** al
"Deepseek v4 Flash" actual, que no se toca.

## Contexto descubierto (arquitectura)

- `MODEL_CATALOG` (`packages/models`) es la única fuente de verdad.
  `userInvocable: true` ⇒ el modelo aparece en **los dos** selectores: chat
  (`INVOCABLE_MODEL_IDS` → `CHAT_MODELS`) y coding agent
  (`generateModelsJson` → `models.json` + `getAvailableModels` →
  `filterAvailableChatModels`). No existe un flag "solo chat" en la
  arquitectura actual; los dos selectores consumen la misma lista.
- Chat: `buildModelConfiguration` resuelve
  `providers[entry.provider.kind](entry.provider.modelId)` (AI SDK).
- Coding agent (Pi): `toPiProviderId(kind)` mapea a un provider de Pi. **Pi 0.79.3
  ya trae `deepseek-v4-flash-free` built-in** bajo el provider `opencode`
  (OpenCode Zen: baseUrl `https://opencode.ai/zen/v1`, api `openai-completions`,
  coste 0, 200k ctx / 128k out, reasoning, thinking high/xhigh), autenticado con
  `OPENCODE_API_KEY` — la misma env que usa `opencode-go`, ya presente en
  `.env.development.local`. No hay que añadir env vars nuevas.
- `packages/model-registry` no tiene consumidores (el chatbot no lo importa); no
  se toca.

## Decisiones

### Enfoque A (recomendado): `userInvocable: true` completo (chat + coding agent)

- `"opencodeZen"` como nuevo `ProviderKind`, entrada de catálogo
  `userInvocable: true`, mapeada al provider built-in de Pi `opencode`.
- Chat: nuevo provider lazy `opencodeZen` en `providers.ts`
  (`createOpenAICompatible` de `@ai-sdk/openai-compatible`, baseURL
  `https://opencode.ai/zen/v1`, `config.opencodeZenApiKey()`).
- Pi: cero cambios de infra (modelo built-in + `OPENCODE_API_KEY` ya en el env
  del worker).
- Trade-off: el modelo también aparece en el selector del coding agent. Esa es
  la semántica de `userInvocable` en este codebase y viene gratis; si no se
  quiere, habría que inventar un concepto "solo chat" nuevo (ver alternativa B).

### Alternativas descartadas

- **B. Solo chat:** requeriría un flag nuevo que la arquitectura no tiene (los
  dos selectores comparten `INVOCABLE_MODEL_IDS`). Más código y un concepto
  nuevo para ocultar un modelo que Pi soporta de forma nativa.
- **C. Solo `model-registry`:** ese paquete no tiene consumidores; no tendría
  efecto en ninguna UI.

## Cambios

### `packages/models`

1. **`src/catalog.ts`**
   - `ProviderKind`: añadir `"opencodeZen"`.
   - Nueva entrada, justo después de "Deepseek v4 Flash":

     ```ts
     {
       // Variante free servida por OpenCode Zen (provider "opencode" built-in
       // de Pi). Los baselines solo cubren opencode-go, así que la entrada
       // se describe a sí misma: valores espejo de la definición built-in de
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
     }
     ```

     El entry se auto-describe (patrón de "Kimi K3" / "Qwen 3.8 Max") porque
     `readBuiltInBaselines()` solo cubre `opencode-go`; sin eso
     `buildModelDefinition` lanzaría error. `temperature`/`topP` espejo de su
     hermano "Deepseek v4 Flash".
2. **`src/mapping.ts`** — `toPiProviderId`:
   `case "opencodeZen": return "opencode";` (built-in de Pi; apiKey vía
   `OPENCODE_API_KEY`, igual que `opencode-go`).
3. **Tests**
   - `catalog.test.ts`: añadir `"Deepseek v4 Flash (free)"` a la lista esperada
     de `INVOCABLE_MODEL_IDS` (tras "Deepseek v4 Flash").
   - `generate-models-json.test.ts`: test nuevo — la entrada emite bajo el
     provider `opencode` con coste 0, 200k/128k, reasoning y el
     thinkingLevelMap declarado, y sobrevive con `builtIns` vacías (entry
     auto-descrito).

**Sin cambios en `generate-models-json.ts` ni en los baselines.**
`deepseek-v4-flash-free` es un id único (solo existe bajo el provider
`opencode` de Pi, no bajo `opencode-go`), así que el lookup actual por model id
sigue siendo inequívoco. `api`/`baseUrl` no se emiten en models.json: el
ModelRegistry de Pi los hereda para providers built-in del primer modelo
built-in del provider — en `opencode` es `big-pickle`, `openai-completions` en
`https://opencode.ai/zen/v1`, exactamente lo que declara el propio built-in de
`deepseek-v4-flash-free` (verificado en `model-registry.js` de
pi-coding-agent 0.79.3). Al ser `opencode` un provider built-in, models.json no
necesita baseUrl/apiKey (auth vía `OPENCODE_API_KEY`).

### `packages/chatbot`

4. **`lib/features/foundation-model/types.ts`** — `Providers`: añadir
   `opencodeZen: (modelId: string) => LanguageModelV3;`
5. **`lib/infrastructure/ai/providers.ts`** — provider lazy (mismo patrón que
   `getOpenCodeGo`):

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

   Cableado en las dos ramas: prod `opencodeZen: (id) => getOpenCodeZen()(id)`
   y test `opencodeZen: lookupMock("opencodeZen")`.

## Lo que NO cambia

- "Deepseek v4 Flash" actual (chat: provider AI SDK `deepseek`; agent:
  `opencode-go`/`deepseek-v4-flash`) — intacto.
- Env vars: sin ninguna nueva. Chat reusa `OPENCODE_ZEN_API_KEY`; Pi usa
  `OPENCODE_API_KEY` (ya en el env del worker).
- `packages/coding-agent`: cero cambios (`readBuiltInBaselines`, scripts,
  session-manager).
- Model picker (renderiza `CHAT_MODELS` de forma genérica), simulator de evals,
  worker-stub, `model-registry`.

## Flujo de datos (chat)

`CHAT_MODELS` (incluye "Deepseek v4 Flash (free)") → picker →
`languageModelConfigurations(id)` → `providers.opencodeZen("deepseek-v4-flash-free")`
→ `POST https://opencode.ai/zen/v1/chat/completions` con `OPENCODE_ZEN_API_KEY`.

## Flujo de datos (coding agent)

`generate-models.ts` emite `providers["opencode"].models[]` con el modelo
(metadatos auto-descritos del catálogo; Pi hereda `api`/`baseUrl` de sus
built-in) → `models.json` → `getAvailableModels` (autenticado vía
`OPENCODE_API_KEY`) → `getCodingAgentModels` →
`toChatModelId("opencode", "deepseek-v4-flash-free")` → id de catálogo → UI.

## Errores / bordes

- Sin `OPENCODE_ZEN_API_KEY`: el provider del chat falla al llamar (igual que
  opencode go hoy); `config.opencodeZenApiKey()` es optional por diseño.
- Sin `OPENCODE_API_KEY` en el worker: el modelo no aparece en
  `getAvailableModels` (misma semántica que el resto de models de opencode).
- Reverse mapping `toChatModelId`: `("opencode", "deepseek-v4-flash-free")` es
  único en el catálogo; no colisiona con entradas `opencode-go`.
- El entry no declara `supportedFiles`: en chat, se oculta el modelo cuando el
  mensaje lleva adjuntos de imagen/PDF (misma semántica que los models
  text-only).

## Verificación

1. `pnpm verify:fast` (lint + type-check + unit/component/integration/contract).
2. Tests concretos: `packages/models` (catalog, generate-models-json),
   `packages/coding-agent` (session-manager available-models).
3. Manual (dev): "Deepseek v4 Flash (free)" visible en el picker de chat y en
   el selector del coding agent; un mensaje por chat responde vía
   `https://opencode.ai/zen/v1/chat/completions`; una sesión de coding agent
   con el modelo funciona.
