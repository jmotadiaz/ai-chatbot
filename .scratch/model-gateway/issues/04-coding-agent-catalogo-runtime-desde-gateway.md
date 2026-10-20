# 04: Migración de `packages/coding-agent` al catálogo en runtime del Model Gateway

**What to build:** `packages/coding-agent` deja de depender de `packages/models` y `packages/inference` y elimina la generación estática de `models.json` en fase de build (`scripts/generate-models.ts`). Al inicializar su `ModelRuntime`, el worker consulta `GET /v1/models/catalog` al Model Gateway y escribe el `models.json` del Entorno con un único proveedor `model-gateway`.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] En `packages/coding-agent/src/runtime/model-runtime.ts` y `models.ts`, antes de invocar `ModelRuntime.create()`, el worker obtiene el catálogo desde `${config.modelGatewayUrl()}/v1/models/catalog` (con `Bearer ${config.modelGatewayApiKey()}`) y materializa `models.json` en `getModelsJsonPath()` bajo un único proveedor `"model-gateway"` (`baseUrl: "${config.modelGatewayUrl()}/v1"`, `api: "openai-completions"`, `apiKey: "$MODEL_GATEWAY_API_KEY"`), asegurando también la credencial correspondiente en `getAuthJsonPath()`.
- [ ] Se elimina `packages/coding-agent/scripts/generate-models.ts` y se actualizan los scripts `dev`, `build` y `build:verify` de `packages/coding-agent/package.json` para no ejecutar generación estática de modelos en compilación.
- [ ] Se eliminan las dependencias `"models": "workspace:*"` e `"inference": "workspace:*"` de `packages/coding-agent/package.json` y se borra `packages/coding-agent/tests/contract/inference-import.test.ts`.
- [ ] Las rutas API puente de coding agent en el chatbot (`app/(chat)/api/agent/code/...`) validan los modelos y niveles de thinking contra el catálogo en runtime sin importar `packages/models`.
- [ ] `pnpm --filter coding-agent test:all`, `pnpm --filter coding-agent type:check` y `pnpm --filter coding-agent build:verify` pasan en verde.

## Comments
