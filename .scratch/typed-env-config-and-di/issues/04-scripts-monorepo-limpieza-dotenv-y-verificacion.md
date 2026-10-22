# 04: Actualización de scripts `package.json`, retirada de `.env.*` / `dotenv-cli` y verificación integral

**What to build:** Migrar los scripts de `package.json` (raíz, `chatbot`, `coding-agent`) a flags `--env=prod|dev|test`, eliminar `dotenv-cli` y los ficheros `.env.{dev,prod,test}`, actualizar `.gitignore` y `AGENTS.md`, y ejecutar la verificación completa sin tocar el servicio vivo de Producción.

**Blocked by:** 01, 02, 03

**Status:** ready-for-agent

- [ ] `package.json` (raíz), `packages/chatbot/package.json` y `packages/coding-agent/package.json` usan `--env=prod|dev|test` (y `--verify` / `--allow-prod-build`) en todos los comandos (`dev`, `build`, `build:verify`, `preview`, `db:*`, `mcp:start`), eliminando todas las invocaciones a `dotenv -o -e ...` y la dependencia `dotenv-cli`.
- [ ] `.gitignore` ignora `packages/config/src/secrets.prod.ts` y `packages/config/src/secrets.dev.ts`. Se eliminan `.env.test` (y `.env.dev`/`.env.prod` una vez migrados sus valores a `secrets.{dev,prod}.ts`).
- [ ] `AGENTS.md` (raíz) y `packages/coding-agent/AGENTS.md` documentan la nueva arquitectura de `packages/config`, el uso de `--env` por `process.argv`, el tradeoff de `scripts/next-cli.ts` y la regla de DI en tests.
- [ ] Pasan limpiamente `pnpm verify:fast`, `pnpm build:verify` y `pnpm test:e2e`, comprobando con `pm2 ls` que el servicio vivo de Producción (`:8085` / `:3015` / `:5435`) no ha sido reiniciado ni afectado.

## Comments
