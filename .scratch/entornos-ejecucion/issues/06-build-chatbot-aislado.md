# 06: Build chatbot aislado y verificación

**What to build:** El operador compila prod a `.next` y el agente verifica compilación prod en `.next/verify` sin pisar prod mientras `next start -p 8085` sirve.

**Blocked by:** 01: Ficheros de Entorno y resolución, 05: Guardarraíles de Entorno

**Status:** ready-for-agent

- [ ] `packages/chatbot/next.config` hace `distDir` parametrizable (`process.env.NEXT_BUILD_DIR || '.next'`)
- [ ] `packages/chatbot` expone `build` y `build:dev` explícitos (`dotenv -e ../../.env.dev -- migrate && next build`), `build:prod` (`dotenv -e ../../.env.prod -- migrate && next build` → `.next`) y `build:prod:verify` (`NEXT_BUILD_DIR=.next/verify` → `.next/verify` aislado, se descarta)
- [ ] `drizzle.config.ts` y `lib/infrastructure/db/migrate.ts` resuelven `.env.<env>` antes de leer `POSTGRES_URL`; `db:dev:migrate`/`db:test:migrate`/`db:prod:migrate` explícitos por Entorno
- [ ] `build:prod` documentado como solo operador/CI (`ALLOW_PROD_BUILD` si se quiere); el agente usa `build:prod:verify`
