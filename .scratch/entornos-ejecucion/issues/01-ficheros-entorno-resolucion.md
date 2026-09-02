# 01: Ficheros de Entorno y resolución

**What to build:** Tres Entornos con ficheros explícitos y resolución centralizada. El operador puede `dotenv -e .env.dev -- printenv POSTGRES_URL` → `5433/dev` y `NEXT_PUBLIC_ENV=prod` resuelve a `.env.prod` sin herencia ni alias oculto.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Existen `.env.dev` y `.env.prod` gitignored con secrets reales y `.env.test` versionado con secrets fake; se elimina `.env.development.local` sin alias
- [x] `resolveEnvFile()` mapea `NEXT_PUBLIC_ENV=test`→`.env.test`, `dev`→`.env.dev`, `prod`→`.env.prod` (y `evals`→`.env.evals`), sin fallback a `.env.development.local`
- [x] `.gitignore` ignora `.env.dev`, `.env.prod`, `.env*.local`, `packages/coding-agent/.pi*` y `.pi-dev`/`.pi-test`/`.pi-prod` hermanos (no `.pi/dev` anidado)
- [x] `packages/config` sigue siendo única fuente de verdad: ningún `src/` lee `process.env` directo; `CODING_AGENT_AUTH_JSON` expuesta por Entorno

## Answer

Resuelto en el orden de bloqueos (01 → 02 → 03).

- **Ficheros**: `.env.dev` y `.env.prod` creados (gitignored) con los secrets reales de `.env.development.local` repartidos por Entorno: dev → `5433/dev` + `PORT=3000` + worker `3016` + dirs `.pi-dev/*`; prod → `5435/prod` + `PORT=8085` + worker `3015` + dirs `.pi-prod/*`. `.env.test` sigue versionado con secrets fake y ahora apunta a `.pi-test/*` (`CODING_AGENT_AUTH_JSON=.pi-test/auth.json`, `CODING_AGENT_MODELS_JSON=.pi-test/models.json`). Eliminados sin alias: `.env.development.local` (raíz y `packages/chatbot/`) y el alias `packages/chatbot/.env.test` (playwright ahora carga `../../.env.test` de raíz).
- **Resolución**: `resolveEnvFile()` (lib/infrastructure/env.ts) devuelve una **ruta absoluta anclada a la raíz del repo** mapeando `NEXT_PUBLIC_ENV` → `test|evals|dev|prod` → `.env.{test,evals,dev,prod}`; default y valores desconocidos → `.env.dev`; nunca `.env.development.local`. Consumidores actualizados: `migrate.ts`, `seed-test-data.ts` (ya usaban resolveEnvFile), `drizzle.config.ts` (era un ternario), `playwright.config.ts`, `eval-runner.ts`. Scripts raíz/chatbot que referenciaban `.env.development.local` apuntan ahora a `.env.dev`/`../../.env.dev` (`dev`, `build`, `start`, `preview`, `transport:http`, `mcp-server`).
- **Gitignore**: añadidos `.env.dev`, `.env.prod`, `/.pi-dev`, `/.pi-test`, `/.pi-prod` (hermanos, no `.pi/<env>` anidado), `/packages/coding-agent/.pi*`, `/packages/coding-agent/dist*`.
- **Config**: verificado que `src/` de ningún package lee `process.env` (única excepción autorizada: `packages/config/src/source.ts`); `CODING_AGENT_AUTH_JSON` ya está en el catálogo y expuesta como `config.codingAgentAuthJson`.

**Verificación**: 13/13 unit tests de `env.test.ts` (mapeos dev/prod + sin fallback a development.local), 25/25 de `packages/config`, `tsc --noEmit` y eslint limpios en archivos tocados.

**Nota de transición**: `ai-chatbot` (pm2 id 1) sigue online con su env cargado en memoria, pero cualquier restart de pm2 fallará hasta que 08 actualice `ecosystem.config.js` a `.env.prod` — secuencia prevista por el DAG (08 depende de 06+07).
