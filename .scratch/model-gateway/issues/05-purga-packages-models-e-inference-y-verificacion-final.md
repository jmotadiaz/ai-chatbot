# 05: Eliminación de `packages/models` y `packages/inference`, limpieza de `config` y verificación integral

**What to build:** Borrar físicamente los paquetes `packages/models` y `packages/inference` del monorepo, eliminar las 10 API keys de proveedores externos de `packages/config`, actualizar las reglas de lint/documentación y verificar todas las suites (`verify:fast`, `build:verify` y `test:e2e`).

**Blocked by:** 03, 04

**Status:** done

- [x] Eliminados por completo los directorios `packages/models` y `packages/inference` y actualizados `pnpm-lock.yaml` y los scripts raíz que los referenciaban.
- [x] Eliminadas de `packages/config/src/catalog.ts` y `packages/config/src/config.ts` las 10 variables de proveedores externos (`AI_GATEWAY_API_KEY`, `OPENCODE_ZEN_API_KEY`, `OPENROUTER_API_KEY`, `DEEPINFRA_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`, `PERPLEXITY_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `COHERE_API_KEY`), quedando únicamente `MODEL_GATEWAY_URL` y `MODEL_GATEWAY_API_KEY`.
- [x] Actualizado `packages/chatbot/eslint.config.mjs`: ningún archivo `"use client"` puede importar `@/lib/infrastructure/ai`, y ningún archivo fuera de `packages/chatbot/lib/infrastructure/ai/` puede importar `@ai-sdk/*`.
- [x] Actualizados los specs E2E (`packages/chatbot/tests/e2e/`) para trabajar contra el catálogo de capacidades servido por el Mock Model Gateway (`:4001`), eliminando `packages/chatbot/tests/mocks/ai/capabilities.ts` y `packages/chatbot/tests/unit/mocks/ai/capabilities.test.ts`.
- [x] Actualizado `AGENTS.md` de la raíz para reflejar la nueva estructura de paquetes (`chatbot`, `coding-agent`, `model-gateway`, `config`, `tracing`).
- [x] Verificación completa en verde sin tocar el servicio de producción vivo (`:8085`/`:3015`): `pnpm verify:fast`, `pnpm build:verify` y `pnpm test:e2e`.

## Comments

## Result

Hecho: paquetes borrados (y restos untracked de `node_modules` purgados en el review), keys de proveedores fuera de config, fronteras de lint con test de contrato, AGENTS.md raíz actualizado, e2e sobre el Mock Gateway. `pnpm verify:fast` en verde tras corregir los 2 errores de lint que dejó la rama (import-x/order y no-duplicates).
