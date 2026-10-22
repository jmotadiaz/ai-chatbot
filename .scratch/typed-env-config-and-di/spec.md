# Spec: Configuración Tipada por Entorno, Selección por `process.argv` / Bundler Alias y DI en Tests

Referencias de dominio y decisiones: [`CONTEXT.md`](../../CONTEXT.md), [ADR 0011](../../docs/adr/0011-configuracion-tipada-por-entorno-y-seleccion-por-argv.md) (supercede a [ADR 0005](../../docs/adr/0005-ficheros-de-entorno.md); preserva las invariantes de [ADR 0002](../../docs/adr/0002-runtime-pi-aislado-por-entorno.md), [ADR 0006](../../docs/adr/0006-build-exclusivo-de-produccion.md) y [ADR 0010](../../docs/adr/0010-model-gateway-desacoplado.md)).

---

## 1. Problema y Diagnóstico Raíz

El 2026-10-22, la Coding Agent Session `452aa7b0-ab8c-4f0a-ad24-3d58525c631d` (y previamente `2ac810b9-692e-4f88-8b2d-3ff74c678aa0`) sufrió el error:

```
400: {"message":"No connected db.","type":"no_db_connection","param":null,"code":"400"}
```

### Cadena causal demostrada en trazas y código
1. **Comportamiento de LiteLLM Proxy (`model-gateway.service`, `:4000`)**: al operar en modo 100% stateless (`config.yaml` sin base de datos Prisma), cuando recibe un `Authorization: Bearer <token>` que **no coincide** con `master_key` (`MODEL_GATEWAY_API_KEY`), LiteLLM intenta buscar el token como virtual key en la base de datos y devuelve `400: "No connected db."` (`litellm/proxy/auth/user_api_key_auth.py:2209`).
2. **Fuga de `process.env` del Coding Agent Worker al subproceso de Vitest**:
   - En el Turn 37 de la sesión `452aa7b0`, el agente ejecutó `pnpm --filter coding-agent test:integration` mediante la herramienta `bash`.
   - El subproceso de Vitest heredó todas las variables de entorno del Coding Agent Worker de Producción (`.env.prod`), incluido `CODING_AGENT_AUTH_JSON=/home/javier/projects/ai-chatbot/packages/coding-agent/.pi-prod/auth.json`.
   - El test `packages/coding-agent/tests/integration/model-unknown-fail-fast.test.ts` mutaba `process.env.MODEL_GATEWAY_API_KEY = "test-key"` y `process.env.CODING_AGENT_MODELS_JSON`, pero **olvidó aislar `CODING_AGENT_AUTH_JSON`**.
   - Al ejecutar `ModelRuntime.create()` dentro del test, `ensureGatewayAuthJson()` leyó `CODING_AGENT_AUTH_JSON` heredado de Producción y **sobrescribió `.pi-prod/auth.json` en disco con `"test-key"`**.
   - En el Turn 38 (22:29:24), el SDK de Pi recargó `.pi-prod/auth.json` desde disco y envió `Bearer test-key` al Model Gateway `:4000`, provocando el `400: No connected db.`. A las 22:30:51, una llamada posterior a `getAvailableModels()` en el worker principal restauró la clave real en `.pi-prod/auth.json`.

---

## 2. Objetivos del Diseño

1. **Erradicar `.env.*` y `process.env` como mecanismo de configuración y selección de Entorno**:
   - Ningún proceso del monorepo depende de variables de entorno heredables (`process.env`) para saber en qué Entorno (`prod`, `dev`, `test`) se ejecuta ni para leer rutas o credenciales.
2. **Configuración y secretos en módulos TypeScript tipados con validación en tiempo de compilación**:
   - Separar la configuración estructural versionada (`config.{prod,dev,test}.ts`) de los secretos (`secrets.{prod,dev}.ts` gitignored y `secrets.test.ts` versionado).
   - Importación estática en TypeScript: si falta `secrets.prod.ts` o `secrets.dev.ts` o falta cualquier propiedad requerida, **`tsc` y el bundler fallan en tiempo de compilación**, nunca en runtime.
3. **Selección de Entorno local al proceso (`process.argv`) + Enlace estático en el bundler (`resolveAlias`)**:
   - `coding-agent` y los scripts CLI usan exclusivamente `--env=prod|dev|test` en `process.argv` (que el kernel Linux jamás clona a subprocesos en `fork()`/`execve()`).
   - `chatbot` (Next.js) usa un micro-launcher (`scripts/next-cli.ts`) que lee `--env=dev|test|prod` desde `process.argv` y fija `turbopack.resolveAlias` y `webpack.resolve.alias` en `next.config.ts`, soldando el módulo del Entorno dentro del bundle compilado.
   - `vitest` y `playwright` fijan `initConfig("test")` en sus propios `vitest.config.ts` / `playwright.config.ts`.
4. **Rutas 100% portables relativas a `REPO_ROOT`**:
   - Eliminar las rutas absolutas del host (`/home/javier/projects/ai-chatbot/...`) de la configuración, resolviendo `REPO_ROOT` dinámicamente desde `import.meta.url` hasta `pnpm-workspace.yaml`.
5. **Inyección de Dependencias (DI) obligatoria en los tests de `packages/coding-agent`**:
   - Prohibir que los tests unitarios o de integración muten `process.env`; proveer un helper canónico `createTestWorkerContext()` que inyecta un sandbox temporal (`mkdtempSync`) en `SessionRegistry`, `ModelRuntime` y `syncGatewayModelsFile`.

---

## 3. Diseño Detallado de `packages/config`

### 3.1 Estructura de ficheros

```
packages/config/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # Re-exporta config, ConfigError, initConfig, tipos y helpers
    ├── types.ts              # Entorno, StructuralConfig, SecretsConfig, AppConfig
    ├── paths.ts              # REPO_ROOT, repoPath(), packagePath()
    ├── config.prod.ts        # Configuración estructural de Producción (versionado)
    ├── config.dev.ts         # Configuración estructural de Desarrollo (versionado)
    ├── config.test.ts        # Configuración estructural de Test (versionado)
    ├── secrets.prod.ts       # Secretos de Producción (GITIGNORED, import estático TS)
    ├── secrets.dev.ts        # Secretos de Desarrollo (GITIGNORED, import estático TS)
    ├── secrets.test.ts       # Secretos deterministas de Test (versionado)
    ├── secrets.example.ts    # Plantilla documentada de SecretsConfig (versionado)
    ├── env.prod.ts           # Bundle estático prod (config.prod + secrets.prod validados y congelados)
    ├── env.dev.ts            # Bundle estático dev  (config.dev  + secrets.dev  validados y congelados)
    ├── env.test.ts           # Bundle estático test (config.test + secrets.test validados y congelados)
    ├── guardrails.ts         # Invariantes de coherencia Entorno ↔ DB DSN ↔ Gateway Port
    ├── errors.ts             # ConfigError
    └── config.ts             # Selector por process.argv / initConfig() + fachada funcional congelada
```

### 3.2 Contrato de Tipos (`packages/config/src/types.ts`)

```ts
export type Entorno = "prod" | "dev" | "test";

export interface StructuralConfig {
  readonly entorno: Entorno;
  readonly port: number;
  readonly modelGatewayUrl: string;
  readonly codingAgentEnabled: boolean;
  readonly codingAgentProjectsRoot: string;
  readonly codingAgentSessionsDir: string;
  readonly codingAgentWorkerUrl: string;
  readonly codingAgentWorkerPort: number;
  readonly codingAgentAuthJson: string;
  readonly codingAgentModelsJson: string;
  readonly codingAgentAgentDir: string;
  readonly codingAgentPiPackagesDir: string;
  readonly codingAgentArtifactsDir: string;
  readonly codingAgentArtifactsUrl?: string;
  readonly dbProvider?: string;
  readonly dbDialect?: string;
  readonly contextWindow: number;
  readonly ragUploadLimit?: string;
  readonly debugChunking: boolean;
  readonly disableDevIndicator: boolean;
  readonly otelEnabled: boolean;
  readonly authTrustHost: boolean;
  readonly evalBaseUrl?: string;
  readonly serverOutput: boolean;
  readonly privateBehavior?: string;
  readonly traceEnabled: boolean;
  readonly traceRaw: boolean;
  readonly traceDir: string;
  readonly traceRunId?: string;
  readonly nextBuildDir: string;
}

export interface SecretsConfig {
  readonly postgresUrl: string;
  readonly modelGatewayApiKey: string;
  readonly authSecret: string;
  readonly exaSearchApiKey?: string;
  readonly exaApiKey?: string;
  readonly mcpApiKey?: string;
}

export type AppConfig = Readonly<StructuralConfig & SecretsConfig>;
```

### 3.3 Resolución Portable de Rutas (`packages/config/src/paths.ts`)

- `findRepoRoot()`: sube directorios desde `path.dirname(fileURLToPath(import.meta.url))` hasta encontrar `pnpm-workspace.yaml` (con fallback a `path.resolve(__dirname, "../../..")`).
- Expone:
  - `REPO_ROOT`: ruta absoluta de la raíz del monorepo.
  - `repoPath(...segments: string[])`: `path.resolve(REPO_ROOT, ...segments)`.
  - `packagePath(pkg: "chatbot" | "coding-agent" | "config" | "tracing", ...segments: string[])`: `path.resolve(REPO_ROOT, "packages", pkg, ...segments)`.
- **Excepción de Producción ([ADR 0002](../../docs/adr/0002-runtime-pi-aislado-por-entorno.md))**: en `config.prod.ts`, `codingAgentSessionsDir` conserva el path histórico vigente de Producción (`/home/javier/coding-agent-sessions` o `path.resolve(os.homedir(), "coding-agent-sessions")`) para no alterar el grupo de sesiones en `~/.pi/agent/sessions`. Todas las demás rutas usan `repoPath` / `packagePath`.

### 3.4 Valores por Entorno (`config.{prod,dev,test}.ts`)

| Propiedad | `config.prod.ts` | `config.dev.ts` | `config.test.ts` |
| :--- | :--- | :--- | :--- |
| `entorno` | `"prod"` | `"dev"` | `"test"` |
| `port` | `8085` | `3000` | `3001` |
| `modelGatewayUrl` | `"http://127.0.0.1:4000"` | `"http://127.0.0.1:4000"` | `"http://127.0.0.1:4001"` |
| `codingAgentWorkerPort` | `3015` | `3016` | `3015` |
| `codingAgentWorkerUrl` | `"http://localhost:3015"` | `"http://localhost:3016"` | `"http://localhost:3001/api/agent/code/worker-stub"` |
| `codingAgentProjectsRoot` | `repoPath("coding-agent-projects")` | `repoPath("coding-agent-projects")` | `repoPath("coding-agent-projects")` |
| `codingAgentSessionsDir` | `path.resolve(os.homedir(), "coding-agent-sessions")` | `packagePath("coding-agent", ".pi-dev/sessions")` | `packagePath("coding-agent", ".pi-test/sessions")` |
| `codingAgentAuthJson` | `packagePath("coding-agent", ".pi-prod/auth.json")` | `packagePath("coding-agent", ".pi-dev/auth.json")` | `packagePath("coding-agent", ".pi-test/auth.json")` |
| `codingAgentModelsJson` | `packagePath("coding-agent", ".pi-prod/models.json")` | `packagePath("coding-agent", ".pi-dev/models.json")` | `packagePath("coding-agent", ".pi-test/models.json")` |
| `codingAgentAgentDir` | `packagePath("coding-agent", ".pi-prod/agent")` | `packagePath("coding-agent", ".pi-dev/agent")` | `packagePath("coding-agent", ".pi-test/agent")` |
| `codingAgentPiPackagesDir` | `packagePath("coding-agent", ".pi-prod/packages")` | `packagePath("coding-agent", ".pi-dev/packages")` | `packagePath("coding-agent", ".pi-test/packages")` |
| `codingAgentArtifactsDir` | `packagePath("coding-agent", ".pi-prod/artifacts")` | `packagePath("coding-agent", ".pi-dev/artifacts")` | `packagePath("coding-agent", ".pi-test/artifacts")` |
| `traceDir` | `packagePath("coding-agent", ".pi-prod/traces")` | `packagePath("coding-agent", ".pi-dev/traces")` | `packagePath("coding-agent", ".pi-test/traces")` |

### 3.5 Selección de Entorno por `process.argv` e `initConfig()`

`packages/config/src/config.ts` resuelve el Entorno activo siguiendo este orden estricto (sin leer ninguna variable de selección en `process.env`):

1. **Inicialización explícita en memoria (`initConfig(entorno, options?)`)**:
   - Usada por `vitest.config.ts` (`initConfig("test")`), `playwright.config.ts` (`initConfig("test")`) y `scripts/next-cli.ts`.
   - Soporta overrides acotados de CLI como `{ verifyBuild?: boolean, allowProdBuild?: boolean }` (para que `--verify` ajuste `nextBuildDir = ".next/verify"` y `codingAgentModelsJson = packagePath("coding-agent", ".pi-verify/models.json")` sin variables de entorno).
2. **Flag de línea de comandos en `process.argv` (`--env=prod | --env=dev | --env=test`)**:
   - Usado por `coding-agent` (`tsx src/transports/http.ts --env=prod`), migraciones (`tsx lib/infrastructure/db/migrate.ts --env=dev`), seeds (`tsx scripts/seed-test-data.ts --env=dev`) y `mcp-server`.
   - También reconoce `--verify` (`build:verify`) y `--allow-prod-build` (`build`) en `process.argv`.
3. **Detección automática de runner de test en `process.argv`**:
   - Si algún argumento de `process.argv` contiene `vitest` o `@playwright/test` y no se pasó `--env`, selecciona automáticamente `"test"`.
4. **Fallo rápido (`ConfigError`)**:
   - Si ninguno de los anteriores aplica, lanza `ConfigError("Missing required CLI flag --env=prod|dev|test")`.

---

## 4. Diseño del Micro-Launcher de Next.js y Bundler Alias (`packages/chatbot`)

### 4.1 Por qué un micro-launcher (`packages/chatbot/scripts/next-cli.ts`)
- El binario CLI `next` (`next/dist/bin/next`) usa `commander` sin `allowUnknownOption()`, por lo que rechaza `--env=...`.
- Además, `next/dist/cli/next-dev.js` lanza el servidor mediante `child_process.fork(startServerPath)` sin propagar `process.argv` al proceso hijo.
- `packages/chatbot/scripts/next-cli.ts` (~40 líneas) parsea:
  - Comando: `dev | build | start`
  - Flags: `--env=dev|test|prod`, `--port=<n>`, `--webpack`, `--verify`, `--allow-prod-build`
  - Llama a `initConfig(env, { verifyBuild, allowProdBuild })` en el mismo proceso.
  - Para `dev` y `start`: invoca directamente `startServer({ dir, port, allowRetry: false, isDev: cmd === "dev" })` de `next/dist/server/lib/start-server`.
  - Para `build`: verifica `allowProdBuild || verifyBuild` e invoca `nextBuild(options, dir)` de `next/dist/cli/next-build`.

> **Tradeoff documentado**: `scripts/next-cli.ts` importa `startServer` (`next/dist/server/lib/start-server`) y `nextBuild` (`next/dist/cli/next-build`), que son módulos internos de Next.js. Al actualizar versiones mayores de Next.js se debe verificar la firma de ambos entrypoints (cubierto por test de contrato).

### 4.2 Enlace en tiempo de compilación en `packages/chatbot/next.config.ts`
Cuando `next.config.ts` se evalúa:
- Obtiene el Entorno activo (`config.entorno()`, o `"prod"` cuando `phase === PHASE_PRODUCTION_BUILD` / `PHASE_PRODUCTION_SERVER`).
- Configura tanto **`turbopack.resolveAlias`** como **`webpack.resolve.alias`** para redirigir `"config"` al entrypoint estático de ese Entorno (`packages/config/src/env.${entorno}.ts`).
- Así, todos los Server Components, Route Handlers, Client Components (para constantes públicas como `config.entorno()`) y workers internos de compilación de Next.js quedan enlazados estáticamente al fichero de su Entorno sin necesidad de `process.env` ni `process.argv`.

---

## 5. Catálogo de Scripts (`package.json`) sin `dotenv-cli`

### 5.1 Raíz (`package.json`)
- `dev`: `pnpm --filter chatbot --filter coding-agent --parallel dev`
- `build`: `pnpm --filter chatbot build && pnpm --filter coding-agent build`
- `build:verify`: `pnpm --filter chatbot build:verify && pnpm --filter coding-agent build:verify`
- `preview`: `pnpm --filter chatbot db:prod:start && pnpm --filter chatbot build --allow-prod-build && pnpm --filter coding-agent build --allow-prod-build && concurrently -n chatbot,worker -c cyan,magenta "pnpm --filter chatbot preview" "pnpm --filter coding-agent preview"`

### 5.2 `packages/chatbot/package.json`
- `dev`: `pnpm run db:dev:start && tsx scripts/next-cli.ts dev --env=dev --port=3000`
- `build`: `tsx lib/infrastructure/db/migrate.ts --env=prod && tsx scripts/next-cli.ts build --env=prod` (exige `--allow-prod-build`)
- `build:verify`: `tsx lib/infrastructure/db/migrate.ts --env=prod && tsx scripts/next-cli.ts build --env=prod --verify`
- `preview`: `tsx scripts/next-cli.ts start --env=prod --port=8085`
- `db:dev:migrate`: `tsx lib/infrastructure/db/migrate.ts --env=dev`
- `db:test:migrate`: `tsx lib/infrastructure/db/migrate.ts --env=test`
- `db:prod:migrate`: `tsx lib/infrastructure/db/migrate.ts --env=prod`
- `db:seed:dev`: `tsx scripts/seed-test-data.ts --env=dev --no-reset --chats=5 --user-messages=2 --assistant-messages=2`
- `db:seed:test`: `tsx scripts/seed-test-data.ts --env=test --reset --chats=100`
- `mcp:start`: `tsx --tsconfig mcp-server/tsconfig.json mcp-server/index.ts --env=dev`
- `test:unit` / `test:component` / `test:integration` / `test:contract`: `vitest run ...` (Vitest inicializa `"test"` en `vitest.config.ts`)
- `test:e2e`: `pnpm run db:test:start && playwright test $PLAYWRIGHT_ARGS` (Playwright inicializa `"test"` en `playwright.config.ts` y su `webServer` ejecuta `npx tsx scripts/next-cli.ts dev --env=test --webpack --port=3001`)

### 5.3 `packages/coding-agent/package.json`
- `dev`: `tsx scripts/install-packages.ts --env=dev && tsx watch src/transports/http.ts --env=dev`
- `build`: `tsx scripts/assert-prod-build-allowed.ts && tsc -p tsconfig.json --outDir dist`
- `build:verify`: `tsc -p tsconfig.json --outDir dist/verify --noEmitOnError false`
- `preview`: `pnpm run db:prod:start 2>/dev/null || true; pnpm run build --allow-prod-build && node --import tsx dist/transports/http.js --env=prod`
- `packages:install`: `tsx scripts/install-packages.ts --env=dev`
- `test:unit` / `test:integration` / `test:contract`: `vitest run ...`

---

## 6. Inyección de Dependencias (DI) en `packages/coding-agent`

### 6.1 Prohibición de configurar tests vía `process.env`
Ningún test en `packages/coding-agent/tests/**` puede asignar `process.env.CODING_AGENT_*` ni `process.env.MODEL_GATEWAY_*`.

### 6.2 Costura de DI en `ModelRuntime`, `gateway-models-sync` y `SessionRegistry`
- `ModelRuntimeOptions` y `SyncGatewayModelsOptions` aceptan explícitamente:
  ```ts
  export interface GatewayRuntimeConfig {
    gatewayUrl?: string;
    apiKey?: string;
    modelsJsonPath?: string;
    authJsonPath?: string;
    agentDir?: string;
    piPackagesDir?: string;
    artifactsDir?: string;
  }
  ```
- `ensureGatewayAuthJson(apiKey, authJsonPath)` recibe `authJsonPath` por parámetro explícito desde `ModelRuntime` (con fallback al default del `config` activo solo cuando se invoca desde el composición root del worker HTTP).

### 6.3 Helper canónico `createTestWorkerContext()` (`packages/coding-agent/tests/helpers/test-context.ts`)
- Crea un directorio temporal único por test (`fs.mkdtempSync(path.join(os.tmpdir(), "ca-test-"))`).
- Devuelve rutas aisladas dentro de ese sandbox (`sessionDir`, `modelsJsonPath`, `authJsonPath`, `agentDir`, `artifactsDir`, `traceDir`) y un `cleanup()` registrado automáticamente.
- Todos los tests de integración y unitarios (`model-unknown-fail-fast.test.ts`, `gateway-models-sync.test.ts`, `session-registry.test.ts`, `paths.test.ts`, `publish-artifact.test.ts`) pasan a inyectar estas opciones explícitamente.

---

## 7. Secuencia de Implementación (Tickets)

1. **Ticket 01 (`01-config-tipada-por-entorno-y-argv.md`)**: Rediseñar `packages/config` con `types.ts`, `paths.ts`, `config.{prod,dev,test}.ts`, `secrets.{prod,dev,test,example}.ts`, `env.{prod,dev,test}.ts` y resolución por `process.argv` / `initConfig()`, poblando `secrets.prod.ts` y `secrets.dev.ts` locales desde los `.env.{prod,dev}` actuales para no perder ninguna credencial.
2. **Ticket 02 (`02-coding-agent-di-y-aislamiento-tests.md`)**: Añadir DI completa de rutas/credenciales en `ModelRuntime`, `syncGatewayModelsFile`, `SessionRegistry` y `paths.ts`, crear `createTestWorkerContext()` y eliminar todas las mutaciones de `process.env` en `packages/coding-agent/tests/**`.
3. **Ticket 03 (`03-chatbot-next-cli-launcher-y-bundler-alias.md`)**: Implementar `packages/chatbot/scripts/next-cli.ts`, configurar `turbopack.resolveAlias` y `webpack.resolve.alias` en `next.config.ts`, y actualizar `playwright.config.ts`, `vitest.config.ts`, `drizzle.config.ts`, `migrate.ts` y `seed-test-data.ts`.
4. **Ticket 04 (`04-scripts-monorepo-limpieza-dotenv-y-verificacion.md`)**: Actualizar todos los `package.json` del monorepo a `--env=prod|dev|test`, retirar `dotenv-cli` y los ficheros `.env.{dev,prod,test}`, actualizar `.gitignore` y `AGENTS.md`, y verificar con `pnpm verify:fast`, `pnpm build:verify` y `pnpm test:e2e` sin tocar el servicio vivo de Producción.
