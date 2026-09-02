# DB por entorno

Cada Entorno (test, dev, prod) tiene su propia base de datos Postgres aislada, con su propio `docker-compose.{env}.yml`, volumen y `POSTGRES_DB`.

Decidimos tres compose files (`docker-compose.dev.yml` → `5433/dev`, `docker-compose.test.yml` → `5434/test`, `docker-compose.prod.yml` → `5435/prod`) — prod mantiene el puerto histórico del worker (ver ADR 0003) pero su DB pasa a `5435/prod` en lugar de un único compose con profiles, porque así `db:*:start` levanta exactamente un Postgres sin riesgo de levantar tres a la vez y sin depender de `--profile`. Se simplifican y renombran los scripts (`db:start` eliminado sin alias → `db:dev:start`/`db:prod:start`/`db:test:start`, `db:jules:*` eliminados, `jules:start` eliminado). `.env.development.local` se elimina (reemplazado por `.env.dev` y `.env.prod`).

Considered Options: (A) un único `compose.yml` con 3 servicios y `profiles: [dev,test,prod]`; (B) 3 files separados. Elegimos B por aislamiento operativo y compatibilidad con los scripts existentes.

Consequences: `drizzle.config.ts` y `lib/infrastructure/db/migrate.ts` deben resolver el `.env.*` del Entorno activo antes de leer `POSTGRES_URL`; cada entorno migra su propia DB.
