---
status: accepted
---

# Configuración tipada por Entorno, selección por `process.argv` / bundler alias e inyección de dependencias en tests

Reemplaza a [ADR 0005](./0005-ficheros-de-entorno.md) y extiende las garantías de aislamiento de [ADR 0002](./0002-runtime-pi-aislado-por-entorno.md) y [ADR 0010](./0010-model-gateway-desacoplado.md).

## Contexto

El 2026-10-22, durante una Coding Agent Session en el Entorno de Producción (`452aa7b0-ab8c-4f0a-ad24-3d58525c631d`), el Coding Agent Worker ejecutó `pnpm --filter coding-agent test:integration` mediante su herramienta `bash`. El test `model-unknown-fail-fast.test.ts` mutaba `process.env.MODEL_GATEWAY_API_KEY = "test-key"` y `process.env.CODING_AGENT_MODELS_JSON`, pero omitió sobreescribir `CODING_AGENT_AUTH_JSON`. Como Linux/Node.js clona automáticamente `process.env` en cada `fork()`/`execve()`, el subproceso de Vitest heredó `CODING_AGENT_AUTH_JSON=.pi-prod/auth.json` del Coding Agent Worker padre y `ensureGatewayAuthJson()` sobrescribió en disco la credencial real de Producción con `"test-key"`, provocando fallos `400: {"message":"No connected db."}` contra LiteLLM Proxy en el siguiente Turn.

El incidente evidenció dos vulnerabilidades estructurales del modelo basado en ficheros `.env.*` y variables de entorno:
1. **`process.env` es estado global mutable y heredable entre procesos**: cualquier proceso hijo lanzado por el Coding Agent Worker hereda todas las variables de entorno del padre salvo que el script hijo las pise una por una.
2. **Los tests del Coding Agent Worker se configuraban mutando `process.env`**, acoplando la configuración de una instancia bajo prueba al estado global del proceso.

## Decisión

1. **Sustitución de `.env.{prod,dev,test}` por módulos TypeScript tipados en `packages/config`**:
   - La configuración estructural (no secreta) vive en tres módulos versionados en Git: `config.prod.ts`, `config.dev.ts` y `config.test.ts`, todos validados en compilación con `satisfies StructuralConfig`.
   - Los secretos (`POSTGRES_URL`, `MODEL_GATEWAY_API_KEY`, `AUTH_SECRET`, `EXASEARCH_API_KEY`, `MCP_API_KEY`) viven en módulos TypeScript separados: `secrets.prod.ts` y `secrets.dev.ts` (**gitignored**) y `secrets.test.ts` (**versionado** con credenciales deterministas de prueba), más una plantilla versionada `secrets.example.ts`.
   - **Fallo en tiempo de compilación (no en runtime)**: los ficheros de secretos se importan estáticamente en TypeScript (`satisfies SecretsConfig`). Si falta `secrets.prod.ts` o `secrets.dev.ts` en la máquina o les falta una clave del contrato, `tsc` (`pnpm type:check`) y el bundler fallan en tiempo de compilación. (En una iteración futura, la custodia de secretos migrará a `systemd-creds`).
   - **Rutas portables vía `REPO_ROOT` (`packages/config/src/paths.ts`)**: ninguna ruta en `config.{prod,dev,test}.ts` hardcodea el home del host (`/home/javier/...`). `paths.ts` resuelve `REPO_ROOT` dinámicamente subiendo desde `import.meta.url` hasta localizar `pnpm-workspace.yaml` (con override opcional `process.env.REPO_ROOT`) y expone `repoPath(...)` y `packagePath(pkg, subpath)` (preservando la excepción histórica de la ruta de sesiones de Producción documentada en [ADR 0002](./0002-runtime-pi-aislado-por-entorno.md)).
   - **Inmutabilidad y compatibilidad de API**: `config` mantiene sus métodos actuales (`config.postgresUrl()`, `config.codingAgentAuthJson()`, etc.) sobre un objeto validado por los guardarraíles de coherencia (`test ↔ 5434/test ↔ :4001`, `dev ↔ 5433/dev`, `prod ↔ 5435/prod`) y congelado con `Object.freeze`.

2. **Selección de Entorno 100% libre de variables de entorno (`process.argv` + alias en bundler)**:
   - Se elimina `dotenv-cli` y no se introduce ninguna variable de entorno selectora (`APP_ENV` / `NEXT_PUBLIC_ENV` en `process.env`).
   - **Coding Agent Worker y scripts CLI (`migrate.ts`, `seed-test-data.ts`, `mcp-server`)**: reciben obligatoriamente `--env=prod | dev | test` (y `--verify` en `build:verify`) mediante **`process.argv`**. Como `process.argv` pertenece exclusivamente al proceso invocado y el kernel nunca lo propaga en `fork()`/`execve()`, ningún subproceso lanzado por la herramienta `bash` del Coding Agent hereda jamás el Entorno del worker padre.
   - **Vitest y Playwright**: sus propios ficheros de configuración (`vitest.config.ts` y `playwright.config.ts`) invocan explícitamente `initConfig("test")` al cargarse (además de detección automática del binario `vitest`/`playwright` en `process.argv`), haciendo imposible que una suite de tests corra en otro Entorno.
   - **Next.js (`packages/chatbot`) — Micro-launcher `scripts/next-cli.ts` + `resolveAlias`**:
     - El CLI oficial de Next.js (`next/dist/bin/next`) rechaza flags desconocidos (`--env`) en `commander` y en `next dev` hace un `child_process.fork()` hacia `start-server.js` sin reenviar `process.argv`.
     - Para evitar usar variables de entorno también en Next.js, `packages/chatbot/scripts/next-cli.ts` parsea `--env=dev|test|prod` (junto con `--port`, `--webpack`, `--verify`, `--allow-prod-build`) desde `process.argv`, inicializa `config` en el mismo proceso e invoca directamente `startServer` (`next/dist/server/lib/start-server`) o `nextBuild` (`next/dist/cli/next-build`).
     - En `packages/chatbot/next.config.ts`, tanto `turbopack.resolveAlias` como `webpack.resolve.alias` redirigen el import `"config"` directamente al módulo del Entorno activo (`env.prod.ts`, `env.dev.ts` o `env.test.ts`). De este modo, todo el código de servidor y cliente compilado por Turbopack o Webpack —incluidos los workers hijos que Next.js bifurca en `build` o `dev`— importa estáticamente el fichero del Entorno sin leer `process.env` ni `process.argv` en runtime.

3. **Inyección de Dependencias (DI) obligatoria en los tests de `packages/coding-agent`**:
   - Queda prohibido configurar tests unitarios o de integración del Coding Agent Worker mutando `process.env`.
   - Un helper canónico `createTestWorkerContext(overrides?)` en `packages/coding-agent/tests/helpers/test-context.ts` crea un directorio temporal aislado (`mkdtempSync`) para `sessionDir`, `modelsJsonPath` y `authJsonPath` e inyecta ese `WorkerConfig` directamente por constructor/parámetro en `SessionRegistry`, `ModelRuntime` y `syncGatewayModelsFile`.

## Considered Options

- **Mantener variables de entorno con un selector `APP_ENV` en `process.env` inyectado inline en `package.json`**: descartado porque cualquier subproceso lanzado fuera de los scripts de `package.json` (por ejemplo, `npx vitest` o `npx tsx` ejecutado directamente por el Coding Agent en su herramienta `bash`) seguiría heredando `process.env.APP_ENV` del proceso padre.
- **Cargador JSON tolerante en runtime para los ficheros de secretos ignorados por Git**: descartado porque retrasa la detección de secretos ausentes o mal tipados al momento de ejecución; importarlos como módulos TypeScript estáticos garantiza fallo inmediato en `tsc` y en el build.
- **Pasar `--env` directamente al binario CLI `next dev` / `next build`**: descartado tras verificar en `next/dist/bin/next` que `commander` rechaza opciones desconocidas y que `next/dist/cli/next-dev.js` bifurca `start-server.js` sin propagar `process.argv`.

## Consequences

- **Tradeoff explícito del micro-launcher de Next.js**: `packages/chatbot/scripts/next-cli.ts` importa `startServer` desde `next/dist/server/lib/start-server` y `nextBuild` desde `next/dist/cli/next-build` (APIs internas de Next.js no cubiertas por semver público). Al actualizar versiones mayores de Next.js se debe verificar la firma de ambos módulos.
- Se eliminan `.env.dev`, `.env.prod`, `.env.test` y la dependencia `dotenv-cli` de los scripts del monorepo; `.gitignore` pasa a ignorar `packages/config/src/secrets.prod.ts` y `packages/config/src/secrets.dev.ts`.
- Ningún proceso del monorepo expone secretos ni selectores de Entorno en `process.env`, cerrando de raíz la contaminación cruzada entre el Coding Agent Worker de Producción/Desarrollo y los subprocesos que ejecuta.
