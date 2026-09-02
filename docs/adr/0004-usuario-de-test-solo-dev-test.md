# Usuario de Test solo en dev y test, con seeds distintos

El Usuario de Test (`test@test.com` / `123456` / `f47ac10b-58cc-4372-a567-0e02b2c3d479`) solo existe en los Entornos de Test y Desarrollo, nunca en Producción. Dev y test tienen scripts de seed distintos.

Decidimos dos seeds: `seed:test` (para e2e, con `--reset` y volumen de datos determinístico) y `seed:dev` (idempotente `--no-reset`, mínimo viable para desarrollo). La alternativa de un único `db:seed` compartido se descartó porque test necesita reset total y dev necesita preservar datos locales.

Consequences: `globalSetup`/`globalTeardown` de Playwright usan `seed:test`; `pnpm dev` (o `db:dev:seed`) usa `seed:dev`; prod no tiene script de seed y su DB nunca contiene `test@test.com`.
