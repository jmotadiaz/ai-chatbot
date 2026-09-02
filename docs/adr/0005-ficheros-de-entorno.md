# Ficheros de entorno: .env.dev y .env.prod ignorados, .env.test versionado

Cada Entorno tiene su propio fichero: `.env.dev` y `.env.prod` (ambos gitignored, con secrets reales) y `.env.test` (versionado, con secrets fake). Todas las variables están duplicadas por entorno; no hay herencia entre ficheros.

Decidimos versionar solo `.env.test` para que `pnpm test:e2e` funcione sin setup manual y mantenga determinismo en CI, mientras `.env.dev`/`.env.prod` permanecen locales. La alternativa de un único `.env.example` con placeholders se descartó porque ocultaba que cada entorno debe tener valores explícitos. `.env.development.local` se elimina (sin alias): su contenido se reparte entre `.env.dev` (dev) y `.env.prod` (prod).

Consequences: `.gitignore` ignora `.env.dev` y `.env.prod` (y mantiene `.env` + `.env*.local`); `packages/config` no necesita lógica "por entorno", cada `.env.*` fija `POSTGRES_URL`, `PORT`, `CODING_AGENT_*` (incluido `CODING_AGENT_AUTH_JSON` por entorno, ADR 0002), etc.; `resolveEnvFile()` mapea `NEXT_PUBLIC_ENV=test|dev|prod` a su `.env.*` correspondiente. Guardarraíl: `config.postgresUrl()` y `globalSetup` validan que `NEXT_PUBLIC_ENV` y `POSTGRES_URL` coincidan (`test ↔ 5434/test`, `dev ↔ 5433/dev`, `prod ↔ 5435/prod`) y fallan fast si no. `TRACE_DIR` también se aísla por entorno.
