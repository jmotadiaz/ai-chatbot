# 06: Build chatbot aislado y verificación

**What to build:** El operador compila prod a `.next` y el agente verifica compilación prod en `.next/verify` sin pisar prod mientras `next start -p 8085` sirve.

**Blocked by:** 01: Ficheros de Entorno y resolución, 05: Guardarraíles de Entorno

**Status:** resolved

- [x] `packages/chatbot/next.config` hace `distDir` parametrizable (`process.env.NEXT_BUILD_DIR || '.next'`)
- [x] `packages/chatbot` expone `build` y `build:dev` explícitos (`dotenv -e ../../.env.dev -- migrate && next build`), `build:prod` (`dotenv -e ../../.env.prod -- migrate && next build` → `.next`) y `build:prod:verify` (`NEXT_BUILD_DIR=.next/verify` → `.next/verify` aislado, se descarta)
- [x] `drizzle.config.ts` y `lib/infrastructure/db/migrate.ts` resuelven `.env.<env>` antes de leer `POSTGRES_URL`; `db:dev:migrate`/`db:test:migrate`/`db:prod:migrate` explícitos por Entorno
- [x] `build:prod` documentado como solo operador/CI (`ALLOW_PROD_BUILD` si se quiere); el agente usa `build:prod:verify`

## Answer

Implementado con TDD (3 cortes verticales, rojo→verde):

1. **`distDir` parametrizable**: claves nuevas `NEXT_BUILD_DIR` (default `.next`) y `ALLOW_PROD_BUILD` (bool truthy `"1"`) en el `ENV_CATALOG` + accessors `config.nextBuildDir()` / `config.allowProdBuild()`. `next.config.ts` usa `distDir: config.nextBuildDir()` (respeta la regla de no leer `process.env` en src/). Contract test: `packages/chatbot/tests/contract/next-config-distdir.test.ts` (2); unit `packages/config/tests/unit/next-build-dir.test.ts` (3).
2. **Gate `ALLOW_PROD_BUILD`**: `packages/chatbot/scripts/assert-prod-build-allowed.ts` (via `config.allowProdBuild()`), primero en la cadena de `build:prod`; sin opt-in → exit 1 con mensaje que dirige a `build:prod:verify` y cita AGENTS.md. `build:prod:verify` NO lo requiere (escribe aislado). Integration test con spawn real: `tests/integration/prod-build-gate.test.ts` (3). Comprobado en vivo: `npm run build:prod` sin gate → bloqueado, exit 1, sin tocar disco.
3. **Scripts** (`packages/chatbot/package.json`): `build` y `build:dev` = `dotenv -o -e ../../.env.dev -- sh -c 'migrate && next build'` (dev canónico, ya no hereda el shell); `build:prod` = gate + `dotenv -o -e ../../.env.prod -- sh -c 'migrate && next build'` → `.next`; `build:prod:verify` = `dotenv -o -e ../../.env.prod -- sh -c 'NEXT_BUILD_DIR=.next/verify migrate && NEXT_BUILD_DIR=.next/verify next build'`; `start:prod` = `build:prod && next start -p 8085` (evolución futura 2 apps, no vía canónica). **Desviación del literal del spec**: los comandos spec `dotenv -e X -- migrate && next build` dejarían `next build` FUERA del dotenv (el `--` solo cubre el primer comando) → se envolvieron en `sh -c '…'` para que NEXT_PUBLIC_* quede inlineado en el build correcto. `preview` (raíz y chatbot) actualizado en el mismo commit: ahora `ALLOW_PROD_BUILD=1 … build:prod` — con `build` forzado a dev, dejar el `build` genérico en preview construiría prod con env de dev. Contract test: `tests/contract/build-scripts.test.ts` (8), incluye «ningún script referencia .env.development.local» y «preview nunca llama al `build` genérico».

Checkbox 3 (drizzle/migrate resuelven `.env.<env>` + `db:<env>:migrate`): ya satisfecho por tickets 01/03/05; queda fijado por el contract test. Nota: el primer `build:prod:verify` real hizo que Next auto-añadiera `.next/verify/types/**` al `include` de `tsconfig.json` — se comitea (Next lo escribe en cada build con distDir nuevo; estable a partir de ahora).

**Verificación real (la prueba de fuego)**: `npm run build:prod:verify` compiló en 50s escribiendo solo a `.next/verify`; snapshot md5+mtime de las entradas de nivel superior de `.next` idéntico antes/después (BUILD_ID prod `rOA6z39R8R2Z9TuKx4Y1324` intacto durante la verificación). Suites: config 35 ✓, chatbot unit+contract 242 ✓, integration 36 ✓, lint y type:check limpios. Prod vivo e intacto tras el arranque manual del operador (ver Comments): 8085 GET 200, worker escuchando 3015, pg 5435 up; migrate contra prod fue no-op (0 migraciones nuevas en la rama; `__drizzle_migrations`=31).

## Comments

- 2026-09-02, incidente durante la verificación final (registrado en map.md): el agente usó `curl -X POST :3015/rpc` sin body como check del worker (patrón heredado del handoff); el POST no es lectura y expuso un bug preexistente (`handleRpc` parsea fuera de try/catch) que tumbó worker+app. El operador reinició a mano; el arranque validó de paso la nueva vía `preview → ALLOW_PROD_BUILD=1 build:prod` con el código de este ticket. El bug del parseo va al ticket 10. Regla operativa resultante: para 3015 solo `ss -tlnp`/`pm2 logs --nostream`, nunca `curl` POST.
