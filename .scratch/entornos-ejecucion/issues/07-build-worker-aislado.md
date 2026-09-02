# 07: Build worker aislado y verificación

**What to build:** El worker prod compila a `dist/` y el agente verifica en `dist/verify` sin pisar el `dist/` que sirve pm2 en `3015`.

**Blocked by:** 01: Ficheros de Entorno y resolución, 04: Runtime Pi aislado por Entorno

**Status:** resolved

- [x] `packages/coding-agent` expone `dev` explícito (`tsx scripts/install-packages.ts && tsx scripts/generate-models.ts && tsx src/transports/http.ts`), sin alias `start` ni `transport:http` redundante
- [x] `build:prod` → `tsc -p tsconfig.json --outDir dist && tsx scripts/generate-models.ts` (genera `dist/` + `.pi-prod/models.json` con `CODING_AGENT_*` de `.env.prod`)
- [x] `build:prod:verify` → `tsc --outDir dist/verify && CODING_AGENT_MODELS_JSON=.pi-verify/models.json tsx scripts/generate-models.ts` (verificación aislada para el agente, escribe a `dist/verify`+`.pi-verify` y se descarta)
- [x] `start:prod` autosuficiente documentado como solo pm2/CI; el agente usa `build:prod:verify`

## Answer

Scripts finales (`packages/coding-agent/package.json`): `dev` = cadena explícita que ya corría prod (idéntica a la antigua `transport:http`, solo renombrada); eliminadas `start` y `transport:http`; `build:prod` = gate propio (`scripts/assert-prod-build-allowed.ts`, mismo contrato que el del chatbot) + `tsc --outDir dist` + `dotenv -o -e ../../.env.prod -- tsx scripts/generate-models.ts`; `build:prod:verify` = `tsc --outDir dist/verify` + `CODING_AGENT_MODELS_JSON=.pi-verify/models.json tsx scripts/generate-models.ts` — **sin dotenv .env.prod a propósito**: verificar no puede reescribir `.pi-prod/models.json` (estado de runtime de prod); el inline del env gana sobre el shell heredado. `start:prod` = `build:prod && node --import tsx dist/transports/http.js`. Añadido `dotenv-cli` al devDeps del worker. **Desviación del literal**: el spec pedía `node dist/transports/http.js` — probado en vivo: Node ESM puro revienta con `ERR_MODULE_NOT_FOUND` porque tsc emite los imports relativos sin extensión (como en src) y los paquetes workspace (`config`, `tracing`, `models`) distribuyen fuentes TS; `--import tsx` mantiene node como runtime con resolutor compatible, probado en puerto 3999 aislado (boot "Coding agent worker listening", GET /artifacts 301, apagado limpio).

Call sites actualizados en el mismo commit: `preview` raíz y chatbot arrancan el worker con `pnpm --filter coding-agent dev` bajo `dotenv -o -e .env.prod` (vía canónica inalterada en comportamiento: cadena idéntica a la que pm2 arrancó hoy); raíz `transport:http` → dev con `-o .env.dev`; chatbot `worker:dev` → dev. `ecosystem.config.js` (no canónico) toca en ticket 08.

Tests (TDD, rojo→verde): `tests/contract/build-scripts.test.ts` (7, incluye «ningún package.json invoca coding-agent transport:http») + `tests/integration/prod-build-gate.test.ts` (2, spawn real). Verificación real: `npm run build:prod:verify` compiló en 5s (dist/verify + .pi-verify/models.json) con `.pi-prod/models.json` bit-idéntico antes/después (md5 7430238…), artifacts de verificación desechados tras la prueba; `build:prod` sin gate bloqueado en vivo (exit 1). Suite worker 277/277, tsc, lint, contract chatbot 11/11. Prod intacto (checks solo de lectura; sin commands mutadores).
