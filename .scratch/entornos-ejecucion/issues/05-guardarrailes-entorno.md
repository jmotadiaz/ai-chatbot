# 05: Guardarraíles de Entorno

**What to build:** Imposible escribir por accidente en la DB de otro Entorno. `NEXT_PUBLIC_ENV=dev` con `POSTGRES_URL=5435/prod` falla rápido antes de migrar.

**Blocked by:** 01: Ficheros de Entorno y resolución, 04: Runtime Pi aislado por Entorno

**Status:** resolved

- [x] Validación en `packages/config` (`config.postgresUrl()` o helper) que comprueba `NEXT_PUBLIC_ENV ↔ POSTGRES_URL` (test↔5434/test, dev↔5433/dev, prod↔5435/prod) y lanza `ConfigError` en cualquier mismatch (test↔dev, dev↔prod, etc.)
- [x] `packages/chatbot/tests/e2e/global-setup` fail-fast si `POSTGRES_URL` no contiene `5434/test` cuando `NEXT_PUBLIC_ENV=test`
- [x] `TRACE_DIR` y `CODING_AGENT_ARTIFACTS_DIR` por Entorno: dev/test aislados en `.pi-*`; prod conserva sus valores vigentes y funcionando (`.pi-prod/traces`, `.pi-prod/artifacts` — ADR 0002 v2); trazas de dev no sobrescriben las de prod

## Answer

- **Guardarraíl en config**: `packages/config/src/guardrails.ts` (`assertDbMatchesEntorno` + tabla `ENTORNO_DB`), enganchado al accessor `config.postgresUrl()` (leyendo `NEXT_PUBLIC_ENV` vía `readEnv`; clave documentada en `DYNAMIC_ENV_KEYS`, fuera del catálogo tipado porque Next la inlinea en build). Cualquier cruce (p. ej. dev↔5435/prod, o la DB legendaria 5432/main) lanza `ConfigError` nombrando Entorno, DSN esperado y obtenido. `optional()` sigue capturando ausente; el mismatch también falla antes de conectar. 32 tests unit en `packages/config` (incl. 22 combinaciones de cruce y la variante sin-parámetro que lee `readEnv`).
- **E2E fail-fast**: `globalSetup` rechaza antes de tocar ninguna DB si el DSN no contiene `5434/test`; además `playwright.config.ts` carga `.env.test` con `override: true` (el shell ya no puede arrastrar `POSTGRES_URL` de prod — ver Incidente abajo) y fija `NODE_ENV=development` en el bloque `webServer.env` (el shell heredaba `NODE_ENV=production`, que reventaba el pipeline CSS de `next dev` y el e2e no lo detectaba porque reutilizaba el servidor vivo de prod). 3 tests de integration en `packages/chatbot/tests/integration/e2e-global-setup-guardrail.test.ts`.
- **`TRACE_DIR`/`CODING_AGENT_ARTIFACTS_DIR`**: `.env.dev` → `.pi-dev/traces`+`.pi-dev/artifacts`; `.env.test` → `.pi-test/traces` (año nuevo: antes no tenía `TRACE_DIR` y caía al default compartido de `packages/tracing/traces`) + `.pi-test/artifacts`; `.env.prod` intacto (`.pi-prod/*` vigentes — ADR 0002 v2). Los artifacts ya se resolvían contra el package (ticket 04) → trazas/artifacts de dev no pueden pisar los de prod.
- **Fijos adicionales que este ticket destapó** (necesarios para que el e2e corriera de verdad):
  - `.env.test` fija `PORT="3001"` y `CODING_AGENT_WORKER_URL=http://localhost:3001/...` (user story 8: test 3001; sin PORT el e2e caía en 3000/8085 según el shell).
  - Bug latente del ticket 01: `resolveEnvFile()` anclaba en `packages/` en lugar de la raíz del repo (test tautológico que lo escondía; `dotenv -o` de los scripts lo enmascaraba). Su `import` de `node:path` llegaba al bundle del cliente y devolvía 500 en `/` en dev. Dividido en `lib/infrastructure/env.ts` (flags puros, cliente-seguro) + `lib/infrastructure/env-file.ts` (server-only, anclaje correcto a la raíz real), consumidores migrados (migrate, seed, eval-runner, drizzle.config) y assertions `existsSync` sobre el fichero resuelto (solo `.env.test`, que es versionado).
- **Fixmes en e2e preexistentes/flaky (orden del operador, 2026-09-02)**: 3 specs `agent-code` (`/agent/code` landing eliminada en 549e8f5 — preexistente, enmascarado porque el e2e reutilizaba el servidor de prod), 1 `settings` (ambigüedad "MiniMax M3" vs "MiniMax M3 (free)" en el catálogo — preexistente), 4 `navigation` (1 viewport/timing, conjunto variable entre corridas) y 1 `projects/chat 3.3` (flaky, pasó en re-run). Suite completa de chat+seed tras fixmes: **36 passed / 7 skipped / 0 failed**.
- Verificación blindada: solo comandos de lectura sobre prod (`curl`, `pm2 ls`) — mismo PID, restarts intactos, 8085:200 durante todo el ticket.

## Comments

- 2026-09-02: el shell del agente (heredado del contexto pm2/prod del operador) exportaba `POSTGRES_URL=…5435/prod`, `PORT=8085`, `NODE_ENV=production` y `NEXT_PUBLIC_ENV=prod`. Antes de este ticket el e2e corría contra **prod** (webServer reutilizado por `reuseExistingServer`); quedó demostrado que la DB de prod nunca recibió escritura de tests (mismas tablas, truncate solo en `postgres-test`). El combo `override:true` + PORT fijado + guardarraíl elimina esa vía.
