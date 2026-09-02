# 05: Guardarraíles de Entorno

**What to build:** Imposible escribir por accidente en la DB de otro Entorno. `NEXT_PUBLIC_ENV=dev` con `POSTGRES_URL=5435/prod` falla rápido antes de migrar.

**Blocked by:** 01: Ficheros de Entorno y resolución, 04: Runtime Pi aislado por Entorno

**Status:** ready-for-agent

- [ ] Validación en `packages/config` (`config.postgresUrl()` o helper) que comprueba `NEXT_PUBLIC_ENV ↔ POSTGRES_URL` (test↔5434/test, dev↔5433/dev, prod↔5435/prod) y lanza `ConfigError` en cualquier mismatch (test↔dev, dev↔prod, etc.)
- [ ] `packages/chatbot/tests/e2e/global-setup` fail-fast si `POSTGRES_URL` no contiene `5434/test` cuando `NEXT_PUBLIC_ENV=test`
- [ ] `TRACE_DIR` y `CODING_AGENT_ARTIFACTS_DIR` por Entorno: dev/test aislados en `.pi-*`; prod conserva sus valores vigentes y funcionando (`.pi-prod/traces`, `.pi-prod/artifacts` — ADR 0002 v2); trazas de dev no sobrescriben las de prod
