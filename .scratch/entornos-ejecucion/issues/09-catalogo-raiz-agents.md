# 09: Catálogo raíz y AGENTS.md

**What to build:** Contrato de scripts final y flujo del agente sin ambigüedad. `pnpm dev` usa `.env.dev`, `preview` es la vía canónica de prod (ADR 0003 v2) y el agente nunca dispara `build:prod` de prod.

**Blocked by:** 03: Scripts DB y seeds por Entorno, 06: Build chatbot aislado y verificación, 07: Build worker aislado y verificación, 08: Ecosystem prod pm2→pnpm autosuficiente

**Status:** ready-for-agent

- [ ] Raíz expone `dev` (`.env.dev -- pnpm --filter chatbot --filter coding-agent --parallel dev`), `build:prod` (ambos packages), `db:dev:*`/`db:test:*`/`db:prod:*` y `db:*:logs` por Entorno; se eliminan sin alias `db:start`, `db:stop`, `db:logs` genérico, `db:jules:*`, `jules:start`, `agent:start` (ya eliminados en 03); se MANTIENEN `preview` (vía canónica de prod) y `start` monorepo (dev)
- [ ] `packages/coding-agent` elimina `start` (alias) y `transport:http` redundante; raíz `transport:http` ahora con `.env.dev`
- [ ] `AGENTS.md` (raíz y `packages/coding-agent/AGENTS.md` si aplica) documenta que el flujo del agente ejecuta siempre `build:prod:verify` (chatbot y worker) para comprobar compilación y **prohíbe explícitamente `build:prod`/`start:prod`** (reservados a operador/CI, pisarían `.next`/`dist` de prod bajo pm2)
