# 03: Micro-launcher `scripts/next-cli.ts` y alias de compilación (`turbopack.resolveAlias` / `webpack.resolve.alias`) en `packages/chatbot`

**What to build:** Implementar el micro-launcher de Next.js que recibe `--env=dev|test|prod` por `process.argv` e inyectar el alias estático de `"config"` en `next.config.ts` tanto para Turbopack como para Webpack, actualizando los runners de Vitest, Playwright y scripts de base de datos.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `packages/chatbot/scripts/next-cli.ts` parsea `dev | build | start` y los flags `--env=dev|test|prod`, `--port=<n>`, `--webpack`, `--verify` y `--allow-prod-build` desde `process.argv`, llama a `initConfig()` en el mismo proceso e invoca `startServer` (`next/dist/server/lib/start-server`) o `nextBuild` (`next/dist/cli/next-build`). Incluye comentario detallado del tradeoff de la API interna de Next.js.
- [ ] `packages/chatbot/next.config.ts` resuelve el fichero de entorno activo (`env.prod.ts`, `env.dev.ts`, `env.test.ts`) y lo configura en `turbopack.resolveAlias` y `webpack.resolve.alias` para que el bundle compilado quede estáticamente enlazado al Entorno sin depender de `process.env` ni `process.argv` en los workers hijos de Next.js.
- [ ] Todos los `vitest.config.ts` del monorepo y `packages/chatbot/playwright.config.ts` invocan `initConfig("test")` al cargarse; el `webServer` de `playwright.config.ts` arranca con `npx tsx scripts/next-cli.ts dev --env=test --webpack --port=3001` sin bloque `env` de configuración de negocio.
- [ ] `drizzle.config.ts`, `lib/infrastructure/db/migrate.ts`, `scripts/seed-test-data.ts` y `mcp-server/index.ts` aceptan `--env=dev|test|prod` por `process.argv` sin usar `dotenv`.
- [ ] Se reemplazan las lecturas restantes de `process.env.NEXT_PUBLIC_ENV` en `packages/chatbot` por `config.entorno()`.

## Comments
