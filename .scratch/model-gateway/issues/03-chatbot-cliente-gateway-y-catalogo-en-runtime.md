# 03: Migración de `packages/chatbot` al Gateway único, contratos `*-default` y `<ModelCatalogProvider>`

**What to build:** `packages/chatbot` deja de depender de `packages/models` y `packages/inference` y de ramificar con `isTestMode()`. Toda su capa de IA (`packages/chatbot/lib/infrastructure/ai/`) habla por HTTP con `MODEL_GATEWAY_URL`, las features internas invocan directamente los 10 `Default Model Contracts` (`*-default`), y los componentes `"use client"` reciben el `Model Catalog` en runtime hidratado desde `app/(chat)/layout.tsx` mediante `<ModelCatalogProvider>`.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `packages/chatbot/lib/infrastructure/ai/` implementa el cliente único contra `${config.modelGatewayUrl()}/v1` (autenticado con `config.modelGatewayApiKey()`), sin `isTestMode()` ni `buildTestClients()`:
  - `fetchModelCatalog()` con caché TTL en memoria de servidor contra `GET /v1/models/catalog`.
  - `languageModel(idOrContract, options)`, `createAgent(idOrContract, options)` y `createAgentModel(idOrContract, options)` (integrando `wrapWithTracing` de `packages/tracing`).
  - `embed(values, { taskType })` invocando `"embedding-default"` (`outputDimensionality: 768`).
  - `rerank({ query, documents, topN })` invocando `"rerank-default"`.
  - `decide(options)` invocando `"decision-default"` contra el endpoint nativo de decisiones del Gateway.
  - `speechModel()` invocando `"tts-default"`.
- [ ] Todas las llamadas internas hardcoded de `packages/chatbot` usan los `Default Model Contracts` acordados:
  - `chatTitle`, `memoryExtraction`, `memoryQueryDecomposition`, `webSearchUrlIntent` $\rightarrow$ `"fast-default"`
  - `englishGrammarCheck`, `englishTranslate` $\rightarrow$ `"flash-default"`
  - `compactionMultimedia` $\rightarrow$ `"vision-default"`
  - `metaPromptRefiner`, `compactionText` $\rightarrow$ `"reasoning-default"`
  - `imageEdit` $\rightarrow$ `"image-default"`
  - Evals / simulador $\rightarrow$ `"free-default"`
- [ ] `packages/chatbot/lib/features/foundation-model/config.ts` elimina todo import de `packages/models`, define `chatModelId` como `string`, y expone los tipos isomorfos (`GatewayModelEntry`, `ChatModelConfiguration`, `ThinkingLevel`, `Company`) junto al `<ModelCatalogProvider>` y el hook `useModelCatalog()`.
- [ ] `app/(chat)/layout.tsx` obtiene el catálogo en el servidor y envuelve el árbol cliente con `<ModelCatalogProvider>`, actualizando `ModelPicker`, `Hub`, `ProjectForm`, `useAvailableModels`, `useChatConfig` y `useSupportedFiles`.
- [ ] Ningún archivo de `packages/chatbot` importa ya `models` ni `inference`.

## Comments
