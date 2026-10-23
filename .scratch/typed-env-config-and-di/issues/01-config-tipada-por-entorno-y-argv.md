# 01: Paquete `packages/config` tipado por Entorno (`config.{prod,dev,test}.ts` + `secrets.{prod,dev,test}.ts`) y selección por `process.argv`

**What to build:** Rediseñar `packages/config` para reemplazar los ficheros `.env.*` y la lectura de `process.env` por módulos TypeScript tipados por Entorno (`StructuralConfig` + `SecretsConfig`), resolución portable de rutas desde `REPO_ROOT`, y selección de Entorno mediante `process.argv` (`--env=prod|dev|test`) o `initConfig()`.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] `packages/config/src/types.ts` define `Entorno = "prod" | "dev" | "test"`, `StructuralConfig`, `SecretsConfig` y `AppConfig = Readonly<StructuralConfig & SecretsConfig>`.
- [x] `packages/config/src/paths.ts` resuelve `REPO_ROOT` subiendo desde `import.meta.url` hasta `pnpm-workspace.yaml` (con override opcional `process.env.REPO_ROOT`) y expone `repoPath(...segments)` y `packagePath(pkg, ...segments)`.
- [x] Se crean `config.prod.ts`, `config.dev.ts` y `config.test.ts` (versionados en Git, `satisfies StructuralConfig`) con todas las rutas portables vía `repoPath`/`packagePath` (conservando la ruta de sesiones histórica de Producción de ADR 0002).
- [x] Se crean `secrets.test.ts` y `secrets.example.ts` (versionados en Git) y se generan en la máquina local `secrets.prod.ts` y `secrets.dev.ts` (gitignored, migrando los secretos actuales de `.env.prod` y `.env.dev`) importados estáticamente en TypeScript para que su ausencia falle en tiempo de compilación (`tsc`).
- [x] Se crean `env.prod.ts`, `env.dev.ts` y `env.test.ts` que combinan `config.<env>` + `secrets.<env>`, ejecutan los guardarraíles de coherencia (`guardrails.ts`) y exportan el objeto congelado con `Object.freeze`.
- [x] `packages/config/src/config.ts` resuelve el Entorno activo por `initConfig()` o `process.argv` (`--env=prod|dev|test`, `--verify`, `--allow-prod-build`, o detección de runner `vitest`/`playwright`), manteniendo los métodos actuales de `config.*` para compatibilidad con los ~50 puntos de llamada del monorepo.
- [x] Tests unitarios en `packages/config/tests/unit/` verifican la resolución de `REPO_ROOT`, los guardarraíles de coherencia, la inmutabilidad (`Object.freeze`) y el parseo de `--env` / `--verify` desde argv.

## Comments
