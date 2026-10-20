# Spec: Model Gateway Desacoplado, Catálogo en Runtime y Eliminación de `models` / `inference`

Referencias de dominio y decisiones: [`CONTEXT.md`](../../CONTEXT.md), [ADR 0010](../../docs/adr/0010-model-gateway-desacoplado.md) (supercede a [ADR 0008](../../docs/adr/0008-inference-kit-fachada-sobre-ai-sdk.md)).

---

## 1. Objetivos del Refactor

1. **Un único servicio de Gateway para toda la máquina (`packages/model-gateway`)**:
   - Basado en **LiteLLM Proxy** (modo 100% stateless mediante `config.yaml`, sin base de datos) envuelto en un micro-entrypoint FastAPI (`server.py`).
   - Desacoplado desde el día 1: vive temporalmente en `packages/model-gateway` sin ninguna dependencia del workspace para poder extraerse a un repositorio independiente con un simple `mv` + `git init`.
   - Desplegado como unidad de sistema **systemd** (`model-gateway.service` en `:4000`) que custodia todas las API keys de proveedores terceros cifradas con **`systemd-creds`** (`LoadCredentialEncrypted=`).
2. **Un único proveedor en `ai-chatbot` (`chatbot` + `coding-agent`)**:
   - Se eliminan de `packages/config` y de los `.env.*` las 10 API keys de proveedores externos (`OPENCODE_ZEN_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `COHERE_API_KEY`, `AI_GATEWAY_API_KEY`, `DEEPINFRA_API_KEY`, `GROQ_API_KEY`, `PERPLEXITY_API_KEY`, `XAI_API_KEY`).
   - Se añaden únicamente `MODEL_GATEWAY_URL` y `MODEL_GATEWAY_API_KEY` como variables de entorno estándar en `.env.{dev,prod,test}` (el resto de variables de `ai-chatbot` como `POSTGRES_URL` o `AUTH_SECRET` permanecen exactamente igual que hoy).
3. **Fin del catálogo tipado estático — Consumo dual de modelos**:
   - **En runtime (`GET /v1/models/catalog`)**: el propio Gateway filtra en servidor (`user_invocable: true`) y devuelve el esquema limpio de metadatos. `chatbot` lo consume para alimentar el Model Picker y la configuración por modelo (hidratado a `"use client"` vía `<ModelCatalogProvider>` en `app/(chat)/layout.tsx`), y `coding-agent` lo consume al arrancar su worker para escribir el `models.json` de Pi con un único provider (`model-gateway`).
   - **En usos internos hardcoded (`Default Model Contracts`)**: las features invocan directamente los nombres estables garantizados por el Gateway (`fast-default`, `flash-default`, `vision-default`, `reasoning-default`, `free-default`, `image-default`, `embedding-default`, `rerank-default`, `decision-default`, `tts-default`).
4. **Eliminación de `packages/models` y `packages/inference` + `Mock Model Gateway` por entorno**:
   - Se borran `packages/models` y `packages/inference`.
   - La fachada ligera sobre el AI SDK + llamadas al Gateway (~250 líneas) vive en `packages/chatbot/lib/infrastructure/ai/`, **sin ningún `isTestMode()`**.
   - En `.env.test`, `MODEL_GATEWAY_URL=http://127.0.0.1:4001` apunta al **Mock Model Gateway** de `packages/chatbot/tests/mocks/gateway/`, que sirve directamente el catálogo de capacidades de test y respuestas deterministas.

---

## 2. Diseño de `packages/model-gateway`

### 2.1 Estructura del paquete

```
packages/model-gateway/
├── package.json              # Scripts: dev, start, creds:set, creds:list, systemd:install
├── pyproject.toml            # Dependencias Python aisladas (litellm[proxy], fastapi, uvicorn, httpx)
├── config.yaml               # Fuente de verdad de modelos user-invocable + contratos *-default
├── server.py                 # Wrapper FastAPI sobre litellm.proxy.proxy_server.app (~60 líneas)
├── systemd/
│   └── model-gateway.service # Unidad de sistema systemd (:4000) con LoadCredentialEncrypted
└── scripts/
    ├── run-gateway.sh        # Carga $CREDENTIALS_DIRECTORY a env efímero del proceso y lanza uvicorn
    └── manage-creds.sh       # Helper CLI sobre systemd-creds encrypt (/etc/model-gateway/creds/*.cred)
```

### 2.2 Contrato de `GET /v1/models/catalog` (filtrado en el servidor)

`server.py` lee `config.yaml` y expone `GET /v1/models/catalog` (protegido por `Authorization: Bearer <MODEL_GATEWAY_API_KEY>`). Filtra en el servidor únicamente las entradas con `model_info.user_invocable == true` (salvo que se pase `?include_internal=true` para inspección manual) y devuelve:

```json
{
  "models": [
    {
      "id": "Kimi K3",
      "company": "Moonshot",
      "isDefault": true,
      "contextWindow": 262144,
      "maxTokens": 32768,
      "cost": {
        "input": 0.6,
        "output": 2.5,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "reasoning": true,
      "thinkingLevels": ["low", "medium", "high"],
      "defaultThinkingLevel": "medium",
      "supportedFiles": ["img", "pdf"],
      "supportedOutput": ["text"],
      "zeroDataRetention": false,
      "temperature": 0.6,
      "topP": 0.95,
      "topK": null
    }
  ]
}
```

### 2.3 Soporte Nativo de Decisions API (`/v1/decisions` y `/v1/systemone`)

LiteLLM Proxy (`>= v1.104.2`) soporta **nativamente** los modelos de decisión (System One / Jev) a través de sus rutas integradas **`POST /v1/decisions`** y **`POST /v1/systemone`** (que acepta directamente el esquema `{ model: "decision-default", state, questions }` de TypeSafe / OpenRouter `alpha.decisions`). Por tanto, `decision-default` se declara como una entrada normal en `model_list` dentro de `config.yaml` y `server.py` no necesita implementar ningún passthrough manual para decisiones.

### 2.4 Tabla de `Default Model Contracts` (`user_invocable: false` en `config.yaml`)

En `config.yaml` se migran únicamente los **14 modelos `user_invocable: true` activos** más estos **10 contratos `*-default`** (purgando los ~40 modelos `userInvocable: false` históricos sin uso):

| Contrato | Uso en `ai-chatbot` (y otras apps de la máquina) | Modelo upstream elegido | Proveedor / Credencial en Gateway |
| :--- | :--- | :--- | :--- |
| `fast-default` | `chatTitle`, `memoryExtraction`, `memoryQueryDecomposition`, `webSearchUrlIntent` | **GPT OSS Mini** (`openai/gpt-oss-20b`, `order: ["groq"]`, ZDR) | Vercel AI Gateway (`AI_GATEWAY_API_KEY`) |
| `flash-default` | `englishGrammarCheck`, `englishTranslate` | **Gemini 3.1 Flash Lite** (`google/gemini-3.1-flash-lite`, reasoning `minimal`, ZDR) | Vercel AI Gateway (`AI_GATEWAY_API_KEY`) |
| `vision-default` | `compactionMultimedia` | **MiMo V2.6 Flash** (`mimo-v2.6-flash`, soporta `img` + `pdf`) | OpenCode Go (`OPENCODE_ZEN_API_KEY`) |
| `reasoning-default` | `metaPromptRefiner`, `compactionText` | **Deepseek v4.1 Flash** (`deepseek-v4.1-flash`, reasoning `max`, ZDR) | OpenCode Go (`OPENCODE_ZEN_API_KEY`) |
| `free-default` | Suites de `evals`, pruebas de humo con LLM real | **Nemotron 3 Super** (`nvidia/nemotron-3-super-120b-a12b:free`) | OpenRouter (`OPENROUTER_API_KEY`) |
| `image-default` | `imageEdit` (`responseModalities: ["IMAGE"]`) | **Nano Banana** (`google/gemini-2.5-flash-image`) | OpenRouter (`OPENROUTER_API_KEY`) |
| `embedding-default` | `embed` en RAG y memoria (768 dimensiones + `taskType`) | **Gemini Embedding 001** (`gemini-embedding-001`) | Google (`GOOGLE_GENERATIVE_AI_API_KEY`) |
| `rerank-default` | `rerank` en Hybrid Search RAG | **Cohere Rerank v4 Pro** (`rerank-v4.0-pro`) | Cohere (`COHERE_API_KEY`) |
| `decision-default` | `decide` en `chatModeRouter` y `englishHelper` | **Jev 1.13** (`typesafe/jev-1.13`) | OpenRouter (`OPENROUTER_API_KEY`) |
| `tts-default` | `speechModel` en `english/actions.ts` (`/v1/audio/speech`) | **GPT-4o Mini TTS** (`gpt-4o-mini-tts-2025-03-20`) | OpenAI (`OPENAI_API_KEY`) |

### 2.5 Gestión de Secretos en `systemd-creds`

- Directorio de credenciales cifradas en el host: `/etc/model-gateway/creds/*.cred`.
- Los secretos requeridos por el Gateway se reducen a **7 credenciales** (1 propia + 6 proveedores activos):
  1. `model_gateway_api_key` (`MODEL_GATEWAY_API_KEY`)
  2. `opencode_zen_api_key` (`OPENCODE_ZEN_API_KEY`)
  3. `ai_gateway_api_key` (`AI_GATEWAY_API_KEY`)
  4. `openrouter_api_key` (`OPENROUTER_API_KEY`)
  5. `google_generative_ai_api_key` (`GOOGLE_GENERATIVE_AI_API_KEY`)
  6. `cohere_api_key` (`COHERE_API_KEY`)
  7. `openai_api_key` (`OPENAI_API_KEY`)
- Script interactivo `packages/model-gateway/scripts/manage-creds.sh`:
  - **`setup` (modo por defecto / wizard)**: recorre en bucle las 7 credenciales anteriores, pide su valor una a una de forma interactiva y ejecuta `sudo systemd-creds encrypt --name=<key_name> - /etc/model-gateway/creds/<key_name>.cred` sobrescribiendo siempre el fichero `.cred` si ya existía.
  - `set <key_name>`: permite actualizar un único secreto puntual.
  - `list`: lista los `.cred` presentes en `/etc/model-gateway/creds/`.
- Unidad `/etc/systemd/system/model-gateway.service`:
  - Declara `LoadCredentialEncrypted=<key_name>:/etc/model-gateway/creds/<key_name>.cred` para cada proveedor upstream y para `model_gateway_api_key`.
  - Corre con `DynamicUser=yes` (UID transitorio por arranque) y `ProtectHome=yes`, y ejecuta un artefacto copiado a `/opt/model-gateway` (`scripts/deploy.sh`): así ningún otro proceso del host — incluidos los agentes que corren como el usuario operador — puede leer `$CREDENTIALS_DIRECTORY`. La unidad fija además `CONFIG_FILE_PATH=/opt/model-gateway/config.yaml` (LiteLLM carga el YAML de esa variable) y usa `StateDirectory=`/`CacheDirectory=` como `HOME` escribible del UID transitorio.
  - `run-gateway.sh` exporta en memoria cada fichero de `$CREDENTIALS_DIRECTORY` a su variable de entorno en mayúsculas antes de hacer `exec uvicorn`.

---

## 3. Cambios en `packages/config`

1. En `packages/config/src/catalog.ts` y `config.ts`:
   - Eliminar `AI_GATEWAY_API_KEY`, `OPENCODE_ZEN_API_KEY`, `OPENROUTER_API_KEY`, `DEEPINFRA_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`, `PERPLEXITY_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `COHERE_API_KEY`.
   - Añadir:
     - `MODEL_GATEWAY_URL` (`config.modelGatewayUrl()`, ej. `http://127.0.0.1:4000` en dev/prod y `http://127.0.0.1:4001` en test).
     - `MODEL_GATEWAY_API_KEY` (`config.modelGatewayApiKey()`, variable de entorno estándar).
2. En `packages/config/src/guardrails.ts`:
   - Añadir validación de coherencia `NEXT_PUBLIC_ENV === "test"` $\leftrightarrow$ `MODEL_GATEWAY_URL` en puerto `4001` (análoga al guardarraíl `5434/test` de `POSTGRES_URL`).

---

## 4. Cambios en `packages/coding-agent`

1. Eliminar las dependencias `"models": "workspace:*"` e `"inference": "workspace:*"` de `packages/coding-agent/package.json` y borrar `tests/contract/inference-import.test.ts`.
2. Eliminar el script de compilación estática `packages/coding-agent/scripts/generate-models.ts` (y quitarlo de los scripts `dev`, `build`, `build:verify` en `package.json`).
3. En `packages/coding-agent/src/runtime/model-runtime.ts` y `models.ts`:
   - Antes de instanciar `ModelRuntime.create()`, hacer `GET ${config.modelGatewayUrl()}/v1/models/catalog` (con header `Authorization: Bearer ${config.modelGatewayApiKey()}`).
   - Escribir en `getModelsJsonPath()` el `models.json` con un único proveedor `model-gateway`:
     ```json
     {
       "providers": {
         "model-gateway": {
           "baseUrl": "<MODEL_GATEWAY_URL>/v1",
           "api": "openai-completions",
           "apiKey": "$MODEL_GATEWAY_API_KEY",
           "models": [ ... ]
         }
       }
     }
     ```
   - Escribir o asegurar en `getAuthJsonPath()` la entrada para `"model-gateway"` con `config.modelGatewayApiKey()`.

---

## 5. Cambios en `packages/chatbot` y Eliminación de `packages/models` y `packages/inference`

1. **Borrar `packages/models` y `packages/inference`**.
2. **Capa de infraestructura de IA (`packages/chatbot/lib/infrastructure/ai/`)**:
   - Sin `isTestMode()` ni constructores de mocks en memoria.
   - Cliente único `@ai-sdk/openai-compatible` (y `@ai-sdk/openai` para speech `/v1/audio/speech`) apuntando a `${config.modelGatewayUrl()}/v1` con `config.modelGatewayApiKey()`.
   - Operaciones expuestas por `inferenceKit`:
     - `fetchCatalog()` (con caché TTL en memoria de servidor) contra `GET /v1/models/catalog`.
     - `languageModel(idOrContract, options)`
     - `createAgent(idOrContract, options)` y `createAgentModel(idOrContract, options)` (envolviendo con `wrapWithTracing` de `packages/tracing`).
     - `embed(values, { taskType })` $\rightarrow$ usa siempre `"embedding-default"` (`outputDimensionality: 768`).
     - `rerank({ query, documents, topN })` $\rightarrow$ usa siempre `"rerank-default"` contra `POST /v1/rerank`.
     - `decide(options)` $\rightarrow$ usa siempre `"decision-default"` contra `POST /v1/decisions`.
     - `speechModel()` $\rightarrow$ usa siempre `"tts-default"` contra `POST /v1/audio/speech`.
3. **Hidratación del `Model Catalog` al cliente (`"use client"`)**:
   - `packages/chatbot/lib/features/foundation-model/config.ts` define los tipos isomorfos (`GatewayModelEntry`, `ChatModelConfiguration`, `ThinkingLevel`, `Company`, `DEFAULT_MODEL_CONTRACTS`) y helpers puros que reciben el catálogo.
   - `app/(chat)/layout.tsx` (Server Component) obtiene el catálogo desde el servidor y envuelve el árbol con `<ModelCatalogProvider catalog={catalog}>`.
   - Los hooks y componentes cliente (`useAvailableModels`, `useChatConfig`, `useSupportedFiles`, `ModelPicker`, `Hub`, `ProjectForm`) leen el catálogo síncronamente desde `useModelCatalog()`.
4. **Mock Model Gateway en `packages/chatbot/tests/mocks/gateway/` (`:4001`)**:
   - Servidor HTTP ligero en Node.js que se levanta para E2E (`playwright.config.ts` / `global-setup.ts`) e integración en el puerto `4001`.
   - Expone `GET /v1/models/catalog` devolviendo directamente el catálogo de capacidades de test (`basicChat`, `basicChatAlt`, `canExecuteTools`, `canSeeImages`, `canProduceReasoning`, `alwaysRefuses`, `failsMidStream`), sin mapeos indirectos a modelos comerciales.
   - Expone `POST /v1/chat/completions` (streaming SSE OpenAI), `POST /v1/embeddings`, `POST /v1/rerank`, `POST /v1/decisions` y `POST /v1/audio/speech` con respuestas deterministas basadas en el modelo solicitado.

---

## 6. Secuencia de Implementación Propuesta (Tickets)

1. **Ticket 01 — Crear `packages/model-gateway` y unidad systemd con `systemd-creds`**:
   - Crear `config.yaml` migrando los modelos actuales y los 10 `Default Model Contracts` (`*-default`).
   - Implementar `server.py` (wrapper FastAPI con `GET /v1/models/catalog` filtrado en servidor y `POST /v1/decisions`).
   - Crear scripts `run-gateway.sh`, `manage-creds.sh` y `systemd/model-gateway.service`.
   - Verificar el servicio levantado en `:4000` (sin tocar prod `:8085`/`:3015`).
2. **Ticket 02 — Crear el `Mock Model Gateway` (`:4001`) y actualizar `packages/config`**:
   - Actualizar `packages/config` (`MODEL_GATEWAY_URL`, `MODEL_GATEWAY_API_KEY` y guardarraíl `test ↔ :4001`).
   - Implementar el servidor HTTP Mock en `packages/chatbot/tests/mocks/gateway/` con el catálogo directo por capacidades y respuestas SSE/JSON deterministas.
3. **Ticket 03 — Migrar `packages/chatbot/lib/infrastructure/ai/` y `<ModelCatalogProvider>`**:
   - Reemplazar las llamadas a `packages/inference` y `packages/models` por el cliente directo al Gateway en `packages/chatbot/lib/infrastructure/ai/` y los contratos `*-default`.
   - Añadir `<ModelCatalogProvider>` en `app/(chat)/layout.tsx` y conectar hooks/componentes del cliente.
4. **Ticket 04 — Migrar `packages/coding-agent` al catálogo en runtime del Gateway**:
   - Reemplazar `scripts/generate-models.ts` por la sincronización en arranque del worker contra `GET /v1/models/catalog` con el proveedor único `model-gateway`.
5. **Ticket 05 — Eliminar `packages/models` y `packages/inference` y verificar suites completas**:
   - Borrar `packages/models` y `packages/inference`, limpiar `eslint.config.mjs` y `package.json`, y pasar `pnpm verify:fast`, `pnpm build:verify` y `pnpm test:e2e`.
