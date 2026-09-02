# 02: Compose por Entorno

**What to build:** Tres Postgres aislados levantables en la misma máquina sin colisión. El operador puede `docker compose -f docker-compose.prod.yml up -d` y tener prod en `5435/prod` mientras dev sigue en `5433/dev`.

**Blocked by:** 01: Ficheros de Entorno y resolución

**Status:** resolved

- [x] `docker-compose.dev.yml` con `name: ai-chatbot-dev`, `container_name: postgres-dev`, `5433:5432`, `POSTGRES_DB=dev`, volumen `pgdata-dev` (o `./postgres-data-dev`)
- [x] `docker-compose.prod.yml` con `name: ai-chatbot-prod`, `container_name: postgres-prod`, `5435:5432`, `POSTGRES_DB=prod`, volumen `pgdata-prod`
- [x] `docker-compose.test.yml` uniformado con `name`/`container_name`/`POSTGRES_DB=test` y `5434:5432` sin volumen persistente
- [x] Se elimina `docker-compose.yml` compartido (`5433/main`); ningún compose usa `POSTGRES_DB=main`

## Answer

- `docker-compose.dev.yml` → `name: ai-chatbot-dev`, `container_name: postgres-dev`, `5433:5432`, `POSTGRES_DB=dev`, volumen nombrado `pgdata-dev`.
- `docker-compose.prod.yml` → `name: ai-chatbot-prod`, `container_name: postgres-prod`, `5435:5432`, `POSTGRES_DB=prod`, volumen nombrado `pgdata-prod`.
- `docker-compose.test.yml` → uniformado: `name: ai-chatbot-test` (antes `ai-chatbot-test-db`), `container_name: postgres-test`, `5434:5432`, `POSTGRES_DB=test`, sin volumen persistente (efímero para e2e).
- Eliminado `docker-compose.yml` compartido (`5433/main`). El contenedor viejo `ai-chatbot-db-postgres-1` se paró y eliminó; sus datos quedan intactos en `./postgres-data` (bind mount, gitignored) sin migrar (out of scope del spec). El contenedor huérfano `postgres-test` (proyecto antiguo) se reemplazó por el del nuevo proyecto.

**Verificación**: `docker compose -f <env>.yml config` válido para los tres; `postgres-dev` (5433/dev) y `postgres-test` (5434/test) levantados via docker y `healthy` con `--wait`.
