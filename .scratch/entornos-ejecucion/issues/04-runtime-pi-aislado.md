# 04: Runtime Pi aislado por Entorno

**What to build:** Los Entornos nuevos (dev/test) escriben solo en su Runtime Pi aislado; prod conserva su configuración de runtime vigente (ADR 0002 v2). Con `CODING_AGENT_AGENT_DIR=.pi-dev/agent` el worker dev no toca `.pi-prod`.

**Blocked by:** 01: Ficheros de Entorno y resolución

**Status:** ready-for-agent

- [ ] `packages/coding-agent/src/runtime/paths.ts` y `models.ts` resuelven `agentDir`, `artifactsDir`, `modelsJson`, `piPackagesDir` y `authJson` relativos al package y aislados por Entorno (`.pi-dev`/`.pi-test` para dev/test; prod conserva sus valores vigentes); `sessionsDir` también se resuelve relativo al package (para que `.pi-dev/sessions` de dev funcione), mientras prod mantiene su literal vigente absoluto
- [ ] `CODING_AGENT_AUTH_JSON` por Entorno (`.pi-dev/auth.json`, `.pi-prod/auth.json`, `.pi-test/auth.json`); se deja de usar `~/.pi/agent/auth.json` global (prod ya usa su copia materializada `.pi-prod/auth.json`)
- [ ] `.env.dev` apunta a `.pi-dev/*`, `.env.test` a `.pi-test/*`; `.env.prod` conserva sus valores de runtime vigentes y funcionando (sin migración de sesiones, artifacts ni auth — ADR 0002 v2)
- [ ] Unit sobre `getCodingAgentDir`/`getAuthJsonPath`/`getArtifactsDir` (y resolución de `sessionsDir`) con overrides relativos verifica aislamiento dev/test
