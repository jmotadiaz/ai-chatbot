# 04: Embeddings y rerank como operaciones del kit resueltas por Model Role

**What to build:** ingesta y recuperación de RAG y la memoria de usuario generan embeddings y reordenan documentos a través del kit (`embed` y `rerank` por Model Role), con el modelo de embeddings y el de rerank declarados en el Model Catalog en lugar de ocultos en el módulo de proveedores. Cambiar cualquiera de los dos es una edición del catálogo. El comportamiento de RAG y memoria (dimensiones, taskType por consulta, topN, umbral de score) no cambia.

**Blocked by:** 02 (kit con clientes e instancia raíz).

**Status:** ready-for-agent

- [ ] `models` incorpora `EMBEDDING_MODELS` (proveedor, id, dimensiones de salida, taskTypes soportados) y `RERANK_MODELS`, como datos puros fuera de `INVOCABLE_MODEL_IDS` y de `generateModelsJson`; y `MODEL_ROLES` con los roles `embedding` y `rerank` apuntando a ellos.
- [ ] El kit expone `embed(role, values, { taskType })`, que aplica las dimensiones y valida el taskType contra el catálogo, y `rerank(role, { query, documents, topN })` devolviendo `{ originalIndex, score }[]`. Ambos resolubles y sustituibles vía `createInferenceKit`.
- [ ] Ingesta de RAG (por lotes con el rate limiter actual), recuperación de RAG y extracción/recuperación de memoria consumen las operaciones del kit a través de sus puertos actuales; `providers.embedding` y `providers.rerank` desaparecen del chatbot.
- [ ] `inference/testing` ofrece embeddings y rerank fake; la composición de test del chatbot los inyecta.
- [ ] Unit del paquete: resolución por rol para embedding y rerank, invariantes de catálogo (cada rol apunta a un id existente en su catálogo). Integration del chatbot: recuperación de RAG con embeddings y rerank fake devuelve los chunks ordenados y filtrados como hoy.
- [ ] `pnpm verify:fast` y `pnpm test:e2e` en verde; `pnpm build:verify` compila.

## Comments
