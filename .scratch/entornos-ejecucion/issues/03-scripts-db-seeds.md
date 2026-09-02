# 03: Scripts DB y seeds por Entorno

**What to build:** Contrato de DB por Entorno verificable. El desarrollador puede `pnpm --filter chatbot db:seed:dev` sin borrar datos locales y `db:seed:test` resetea determinísticamente para e2e.

**Blocked by:** 01: Ficheros de Entorno y resolución, 02: Compose por Entorno

**Status:** resolved

- [x] `packages/chatbot` expone `db:dev:start|stop|migrate|logs`, `db:test:start|stop|migrate|logs`, `db:prod:start|stop|migrate|logs` explícitos por Entorno (con `dotenv -e ../../.env.<env>`)
- [x] `db:seed:dev` ligero idempotente (`--no-reset --chats 5`) y `db:seed:test` pesado con reset (`--reset --chats 100`, usado por `globalSetup`)
- [x] Se eliminan sin alias `db:start`, `db:stop`, `db:jules:*`, `jules:start`, `agent:start`, `db:seed` y `db:migrate` genéricos
- [x] Raíz delega `db:dev:*`, `db:test:*`, `db:prod:*` y `db:*:logs` a `chatbot:db:*`

## Answer

- `packages/chatbot` expone el contrato por Entorno: `db:dev:start|stop|migrate|logs`, `db:test:start|stop|migrate|logs`, `db:prod:start|stop|migrate|logs`, `db:seed:dev` (`--no-reset --chats=5 --user-messages=2 --assistant-messages=2`) y `db:seed:test` (`--reset --chats=100`). `dev` arranca ahora con `db:dev:start`.
- Eliminados sin alias en chatbot: `db:start`, `db:stop`, `db:migrate`, `db:seed`, `db:jules:*`, `jules:start`, `agent:start`, `db:logs`, `test:e2e:jules`. En raíz: `db:start`, `db:stop`, `db:migrate`, `db:seed`, `db:logs`, `db:jules:*`, `jules:start`, `agent:start` y `test:e2e:jules` (estos últimos de raíz correspondían al ticket 09, pero quedaban rotos al eliminar sus dianas en chatbot; se eliminan aquí y se deja nota en el mapa). `preview` se mantiene adaptado a `db:dev:start` para compatibilidad con pm2 hasta 08/09.
- Raíz delega `db:dev:*`, `db:test:*`, `db:prod:*` y `db:*:logs` a `chatbot:db:*`. Se mantienen `db:generate`/`db:push` y el flujo `test:e2e` (`db:test:start && playwright`).

**Desviaciones del catálogo del spec (documentadas)**:
1. Migrate/seed llevan `dotenv -o` (override): el shell del operador suele heredar `POSTGRES_URL` (user story 7: "no herencia implícita"); sin `-o`, `dotenv -e` no sobrescribe y el comando escribe en la DB equivocada. Con `-o`, el `.env.<env>` explícito siempre gana.
2. `--chats=N` (con `=`) en lugar de `--chats N`: `seed-test-data.ts` parsea solo la forma `--chats=N` (`argv.find(a => a.startsWith("--chats="))`); la forma con espacio se ignoraba y caía al default 100.

**Verificación**: migraciones aplicadas en `5433/dev` y `5434/test` (aisladas); `db:seed:test` resetea y crea 100 chats determinísticos; `db:seed:dev` ligero (5 chats) idempotente sobre el usuario de test (3 corridas sin reset); conteos en DB: dev = 1 test user/15 chats, test = 1 test user/100 chats/1000 messages. Delegación raíz verificada (`pnpm db:dev:start`/`db:test:start` → healthy). 231 unit tests de chatbot + 25 de config verdes.

**Nota**: `global-setup` de e2e aún toma `process.env.POSTGRES_URL` primero (heredado) — el fail-fast de `5434/test` es el checklist del ticket 05; los e2e completos no deben correrse en shells con `POSTGRES_URL` heredada hasta que 05 aterrice.
