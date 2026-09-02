# 09: Catálogo raíz y AGENTS.md

**What to build:** Contrato de scripts final y flujo del agente sin ambigüedad. `pnpm dev` usa `.env.dev`, `preview` es la vía canónica de prod (ADR 0003 v2) y el agente nunca dispara `build:prod` de prod.

**Blocked by:** 03: Scripts DB y seeds por Entorno, 06: Build chatbot aislado y verificación, 07: Build worker aislado y verificación, 08: Ecosystem prod pm2→pnpm autosuficiente

**Status:** resolved

- [x] Raíz expone `dev` (`.env.dev -- pnpm --filter chatbot --filter coding-agent --parallel dev`), `build:prod` (ambos packages), `db:dev:*`/`db:test:*`/`db:prod:*` y `db:*:logs` por Entorno; se eliminan sin alias `db:start`, `db:stop`, `db:logs` genérico, `db:jules:*`, `jules:start`, `agent:start` (ya eliminados en 03); se MANTIENEN `preview` (vía canónica de prod) y `start` monorepo (dev)
- [x] `packages/coding-agent` elimina `start` (alias) y `transport:http` redundante; raíz `transport:http` ahora con `.env.dev`
- [x] `AGENTS.md` (raíz y `packages/coding-agent/AGENTS.md` si aplica) documenta que el flujo del agente ejecuta siempre `build:prod:verify` (chatbot y worker) para comprobar compilación y **prohíbe explícitamente `build:prod`/`start:prod`** (reservados a operador/CI, pisarían `.next`/`dist` de prod bajo pm2)

## Answer

**Implementado en `c101dee` (mismo commit que 08, verifica 08 primero):**

1. **Raíz `package.json` — catálogo final** (spec → Implementation Decisions → Catálogo final):
   - `dev`: `dotenv -e .env.dev -- pnpm --filter chatbot --filter coding-agent --parallel dev` (ya estaba)
   - **`build:prod` nuevo**: `pnpm --filter chatbot build:prod && pnpm --filter coding-agent build:prod` — orquesta ambos (CI/operador, con gate `ALLOW_PROD_BUILD=1` en cada package)
   - **`build:prod:verify` nuevo**: `pnpm --filter chatbot build:prod:verify && pnpm --filter coding-agent build:prod:verify` — vía del agente, aislada
   - `db:dev:*`/`db:test:*`/`db:prod:*` + `db:*:logs` por Entorno (delegan a chatbot) — ya estaban desde 03
   - Eliminados sin alias: `db:start`, `db:stop`, `db:logs` genérico, `db:jules:*`, `jules:start`, `agent:start` — ya eliminados en 03, verificado `grep` 0 hits
   - Mantenidos: `preview` (raíz `dotenv -o -e .env.prod -- sh -c 'db:prod:start && ALLOW_PROD_BUILD=1 build:prod && concurrently start + dev'` — vía canónica 1 app) y `start` monorepo `dotenv -e .env.dev -- pnpm --filter chatbot --filter coding-agent --parallel start` (dev, no prod)
   - `build:worker` y `transport:http` (`dotenv -o -e .env.dev -- pnpm --filter coding-agent dev` + alias `worker:dev`) intactos; `start:prod` en raíz **no creado** (checklist 08/09).

2. **`packages/coding-agent` — ya resuelto en 07:** `start` y `transport:http` eliminados, `dev` explícito; raíz `transport:http` ya con `.env.dev`. Verificado por contract `tests/contract/build-scripts.test.ts` ("ningún package.json invoca coding-agent transport:http", "preview arranca worker con dev bajo .env.prod") — 7/7 y 8/8 chatbot.

3. **`AGENTS.md` raíz** — blindaje ampliado (skill `writing-for-agents`):
   - Sección «Producción está VIVA»: segundo bullet ahora documenta **flujo del agente siempre `build:prod:verify`** (raíz o por paquete, aislado `.next/verify`/`dist/verify`/`.pi-verify`) y **prohibición explícita de `build:prod`/`start:prod`** (pisa artefactos de prod bajo pm2; solo operador/CI con `ALLOW_PROD_BUILD=1`). Primer bullet ya prohibía `build:prod`/`start:prod` sin aprobación.
   - `Package Manager`: lista `build:prod` (solo operador/CI) vs `build:prod:verify` (vía del agente) + `preview` (solo pm2) y `db:<env>:*` por Entorno, con puertos 3000+3016/5433 dev vs 8085+3015/5435 prod.

4. **`packages/coding-agent/AGENTS.md`** — cabecera + nueva sección «Entornos y scripts»: dev (`pnpm dev` tsx), prod (`pm2 preview` 1 app), verificación (`build:prod:verify` aislado sin `dotenv -o .env.prod` — no toca runtime de prod). Misma prohibición `build:prod`/`start:prod`.

**Verificación:** `pnpm lint` + `type:check` limpios; `pnpm test:fast` (unit 231 chatbot + config 35, component 139, integration 36 chatbot + 41 worker, contract 11+28) verde; `build:prod:verify` real: worker 5s (`.pi-prod` bit-idéntico), chatbot 27s (`.next/BUILD_ID` prod intacto); `grep .env.development.local` 0 en scripts; `ecosystem.config.js` 1 app `preview` + `.env.prod`.

Commit: `c101dee`.
