# Paquete Central de Configuración de Entorno (`packages/config`) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizar el acceso a variables de entorno de todo el monorepo (excepto `NEXT_PUBLIC_*`) en un nuevo paquete `packages/config`: catálogo declarativo + acceso tipado vía objeto semántico, de modo que ningún consumidor vuelva a tocar `process.env` en `src/` y el camino a la credentials API de systemd quede marcado.

**Architecture:** `packages/config` contiene un catálogo data-driven (`ENV_CATALOG`), un único módulo fuente (`source.ts`) que toca `process.env` (con la costura documentada para `$CREDENTIALS_DIRECTORY`), builders tipados (`string`/`stringOptional`/`secret`/`secretOptional`/`int`/`intOptional`/`bool`) y un objeto semántico `config.*` como API pública. Los tres paquetes consumidores (`chatbot`, `coding-agent`, `tracing`) dependen de `config` y migran sus lecturas. Lectura perezosa (en cada llamada), errores solo al acceder, defaults/parsing declarados en el catálogo o en builders.

**Tech Stack:** pnpm workspaces, TypeScript (ESM, `tsx`), Vitest 4, Next.js 16 (chatbot), `@earendil-works/pi-coding-agent` (worker).

**Spec:** `docs/superpowers/specs/2026-08-10-centralized-env-config-design.md`

## Global Constraints

- **Nada de `process.env` en `src/` de los consumidores** al terminar: criterio de salida `rg -n "process\.env" packages/{chatbot,coding-agent,tracing}/src` = 0 hits (excepto `packages/chatbot/lib/infrastructure/env.ts`, que es del flujo `NEXT_PUBLIC_*`, y comentarios).
- **`NEXT_PUBLIC_*` fuera de alcance:** `NEXT_PUBLIC_ENV` y `lib/infrastructure/env.ts` NO se migran.
- **Lectura perezosa:** los accessors leen `process.env` en cada llamada, nunca al importar. Preserva `vi.stubEnv` en tests y el orden de carga de `dotenv`.
- **Errores solo al acceder:** sin validación fail-fast al arranque. Requerida ausente → `ConfigError` al llamar al accessor throwing.
- **Secreto ≠ configuración:** las variables `secret: true` del catálogo se leen SIEMPRE vía `resolveSecret` (costura de systemd).
- **Scaffold de paquete compartido:** patrón `packages/models` (sin build, `main: ./src/index.ts`, `exports`), scripts `lint`, `lint:fix`, `test:unit`, `type:check`.
- **Commits:** obligatorio `Co-Authored-By: Claude <noreply@anthropic.com>` (AGENTS.md). El pre-commit hook corre el suite completo (`pnpm -r test:unit` + `test:component` + `test:integration` + `test:contract`) — los commits de migración tardarán unos minutos.
- **Verificación:** `pnpm verify:fast` (lint + type:check + test:fast) al final y tras cada tarea grande.

## Deviations from spec (decididas durante la planificación)

1. **`playwright.config.ts`: el bloque `env:` de reenvío al `webServer` NO se migra.** Plumbear valores crudos (strings) a un proceso hijo con defaults distintos de la app (p.ej. `CODING_AGENT_ENABLED ?? "true"`) es un concern distinto; se deja con `process.env` y un comentario que lo explica. El resto de lecturas del archivo (`PORT`, `CI`, `SERVER_OUTPUT`) sí se migran. El criterio de salida (src/ = 0 hits) no cubre la raíz del package.
2. **Dos variables no estaban en el inventario del spec** y se añaden al catálogo: `DEEPINFRA_API_KEY` (secreta, `lib/infrastructure/ai/providers.ts:57`) y `PRIVATE_BEHAVIOR` (string, `app/(auth)/register/page.tsx:8`). Además `CODING_AGENT_SUPERPOWERS_REF` (ref dinámica de superpowers en `pi-packages.ts`), que se documenta en el catálogo y se lee vía el escape hatch `readEnv` exportado (clave dinámica por paquete).
3. **`META_API_KEY` se marca `required: false`** y se usa `secretOptional`: hoy `providers.ts` pasa `process.env.META_API_KEY` (posiblemente `undefined`) al provider; el acceso no debe lanzar (comportamiento preservado). La nota del spec ("acceso lanza error claro") aplica solo donde el accessor es throwing.
4. **Booleano sin `truthy` = presencia** (`raw !== ""`), para `CI` y `SERVER_OUTPUT` (`!!process.env.X`). Booleano ausente sin default → `false`.
5. **Los defaults del catálogo solo donde el mismo default lo usan varios consumidores**: `CODING_AGENT_WORKER_PORT: 3015`, `CODING_AGENT_WORKER_URL: "http://localhost:3015"`, `DEFAULT_CONTEXT_WINDOW: 128000`. Defaults de un solo consumidor (`PORT: 3000` en playwright) se quedan en el call site (`?? 3000`).
6. **`optional()` helper** público en `config` para los pocos call sites que usan una variable catalogada como requerida pero la tratan defensivamente (`changes/route.ts`, `files/route.ts`, `session-manager.ts:610`, logging de `eval-runner.ts`, `seed-test-data.ts`).

---

### Task 1: Scaffold de `packages/config`

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `packages/config/src/index.ts` (placeholder mínimo)
- Modify: `pnpm-lock.yaml` (vía `pnpm install`)

**Interfaces:**
- Consumes: nada.
- Produces: paquete `config` instalable como `"config": "workspace:*"` en los consumidores.

- [ ] **Step 1: Crear `packages/config/package.json`**

```json
{
  "name": "config",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint . --config ../../eslint.config.mjs",
    "lint:fix": "eslint --fix . --config ../../eslint.config.mjs",
    "test:unit": "vitest run tests/unit --passWithNoTests",
    "type:check": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 2: Crear `packages/config/tsconfig.json`** (idéntico a `packages/models/tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Crear placeholder `packages/config/src/index.ts`**

```ts
// Paquete central de configuración de entorno. Implementación en tareas siguientes.
export {};
```

- [ ] **Step 4: Instalar y verificar**

Run: `pnpm install && pnpm --filter config type:check && pnpm --filter config test:unit`
Expected: install OK (lockfile actualizado), tsc sin errores, vitest reporta "No test files found" o pasa vacío.

- [ ] **Step 5: Commit**

```bash
git add packages/config pnpm-lock.yaml
git commit -m "chore(config): scaffold central env config package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Catálogo (`catalog.ts`) + tests de integridad

**Files:**
- Create: `packages/config/src/catalog.ts`
- Test: `packages/config/tests/unit/catalog.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `EnvVarSpec`, `ENV_CATALOG`, `EnvKey`, `getSpec(key: EnvKey): EnvVarSpec` — usados por builders (Task 4) y tests.

- [ ] **Step 1: Escribir el test que falla** — `packages/config/tests/unit/catalog.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { ENV_CATALOG } from "../../src/catalog";

describe("ENV_CATALOG", () => {
  it("declara todas las variables verificadas del monorepo (fuente única)", () => {
    const expectedKeys = [
      // chatbot — secretos
      "POSTGRES_URL", "META_API_KEY", "OPENCODE_ZEN_API_KEY", "DEEPINFRA_API_KEY",
      "EXASEARCH_API_KEY", "EXA_API_KEY", "MCP_API_KEY", "AUTH_SECRET",
      // chatbot — configuración
      "CODING_AGENT_ENABLED", "CODING_AGENT_PROJECTS_ROOT", "CODING_AGENT_SESSIONS_DIR",
      "CODING_AGENT_WORKER_URL", "CODING_AGENT_WORKER_PORT", "CODING_AGENT_AUTH_JSON",
      "DB_PROVIDER", "DB_DIALECT", "DEFAULT_CONTEXT_WINDOW", "RAG_UPLOAD_LIMIT",
      "DEBUG_CHUNKING", "DISABLE_DEV_INDICATOR", "OTEL_ENABLED", "AUTH_TRUST_HOST",
      "EVAL_BASE_URL", "SERVER_OUTPUT", "PORT", "PRIVATE_BEHAVIOR",
      "TRACE_RUN_ID", "TRACE_DIR",
      // coding-agent
      "CODING_AGENT_MODELS_JSON", "CODING_AGENT_AGENT_DIR", "CODING_AGENT_PI_PACKAGES_DIR",
      "CODING_AGENT_SUPERPOWERS_REF",
      // tracing
      "TRACE_ENABLED", "TRACE_RAW",
      // system/framework
      "NODE_ENV", "CI",
    ];
    expect(Object.keys(ENV_CATALOG).sort()).toEqual(expectedKeys.sort());
  });

  it("no declara ninguna NEXT_PUBLIC_*", () => {
    expect(Object.keys(ENV_CATALOG).some((k) => k.startsWith("NEXT_PUBLIC_"))).toBe(false);
  });

  it("tiene descripciones no vacías y tipos válidos", () => {
    for (const [key, spec] of Object.entries(ENV_CATALOG)) {
      expect(spec.description.trim().length, key).toBeGreaterThan(0);
      expect(["string", "number", "boolean"], key).toContain(spec.type);
    }
  });

  it("los defaults son consistentes con el tipo", () => {
    for (const [key, spec] of Object.entries(ENV_CATALOG)) {
      if (spec.default === undefined) continue;
      if (spec.type === "number") expect(typeof spec.default, key).toBe("number");
      if (spec.type === "string") expect(typeof spec.default, key).toBe("string");
      if (spec.type === "boolean") expect(typeof spec.default, key).toBe("boolean");
    }
  });

  it("las variables managed no son requeridas", () => {
    for (const [key, spec] of Object.entries(ENV_CATALOG)) {
      if (spec.managed) expect(spec.required, key).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm --filter config test:unit`
Expected: FAIL — `catalog.ts` no existe (`Cannot find module`).

- [ ] **Step 3: Implementar `packages/config/src/catalog.ts`**

```ts
export interface EnvVarSpec {
  /** Propósito de la variable; aparece en errores y documentación. */
  description: string;
  type: "string" | "number" | "boolean";
  /** true → el accessor throwing lanza ConfigError si falta al acceder. */
  required: boolean;
  /** true → el accessor lee vía resolveSecret (costura systemd, source.ts). */
  secret: boolean;
  /** Valor usado cuando la variable no está definida (solo si lo comparten varios consumidores). */
  default?: string | number | boolean;
  /** type:"boolean": el valor exacto que cuenta como true. Ausente → presencia (raw !== ""). */
  truthy?: string;
  /** true → la provee el runtime/framework (NODE_ENV, CI); no se define a mano. */
  managed?: boolean;
}

export const ENV_CATALOG = {
  // --- chatbot: secretos ---
  POSTGRES_URL: { description: "DSN de la base de datos Postgres", type: "string", required: true, secret: true },
  META_API_KEY: { description: "API key del proveedor Meta (gateway)", type: "string", required: false, secret: true },
  OPENCODE_ZEN_API_KEY: { description: "API key del proveedor OpenCode Zen", type: "string", required: false, secret: true },
  DEEPINFRA_API_KEY: { description: "API key de DeepInfra", type: "string", required: false, secret: true },
  EXASEARCH_API_KEY: { description: "API key de Exa Search (actual)", type: "string", required: false, secret: true },
  EXA_API_KEY: { description: "API key de Exa (legacy; alias de EXASEARCH_API_KEY)", type: "string", required: false, secret: true },
  MCP_API_KEY: { description: "API key de autenticación del mcp-server", type: "string", required: false, secret: true },
  AUTH_SECRET: { description: "Secreto de auth.js", type: "string", required: false, secret: true },

  // --- chatbot: configuración ---
  CODING_AGENT_ENABLED: { description: "Activa el agente de código", type: "boolean", required: false, secret: false, truthy: "true" },
  CODING_AGENT_PROJECTS_ROOT: { description: "Raíz de proyectos del coding agent", type: "string", required: true, secret: false },
  CODING_AGENT_SESSIONS_DIR: { description: "Directorio de sesiones del coding agent", type: "string", required: true, secret: false },
  CODING_AGENT_WORKER_URL: { description: "URL base del worker", type: "string", required: false, secret: false, default: "http://localhost:3015" },
  CODING_AGENT_WORKER_PORT: { description: "Puerto del worker", type: "number", required: false, secret: false, default: 3015 },
  CODING_AGENT_AUTH_JSON: { description: "Ruta del auth.json del worker", type: "string", required: false, secret: false },
  DB_PROVIDER: { description: "Proveedor de DB; 'pglite' activa el modo embebido", type: "string", required: false, secret: false },
  DB_DIALECT: { description: "Dialecto de DB; 'pglite' activa el modo embebido", type: "string", required: false, secret: false },
  DEFAULT_CONTEXT_WINDOW: { description: "Ventana de contexto por defecto", type: "number", required: false, secret: false, default: 128000 },
  RAG_UPLOAD_LIMIT: { description: "Límite de URLs en RAG; el string 'false' lo desactiva", type: "string", required: false, secret: false },
  DEBUG_CHUNKING: { description: "Escribe dumps de depuración de chunking", type: "boolean", required: false, secret: false, truthy: "true" },
  DISABLE_DEV_INDICATOR: { description: "Desactiva los indicadores de desarrollo de Next", type: "boolean", required: false, secret: false, truthy: "1" },
  OTEL_ENABLED: { description: "Activa OpenTelemetry", type: "boolean", required: false, secret: false, truthy: "1" },
  AUTH_TRUST_HOST: { description: "Confía en el host para auth.js", type: "boolean", required: false, secret: false, truthy: "true" },
  EVAL_BASE_URL: { description: "URL base del servidor en modo evals", type: "string", required: false, secret: false },
  SERVER_OUTPUT: { description: "Muestra stdout/stderr del servidor en playwright", type: "boolean", required: false, secret: false },
  PORT: { description: "Puerto HTTP", type: "number", required: false, secret: false },
  PRIVATE_BEHAVIOR: { description: "Habilita features privadas cuando es 'enabled'", type: "string", required: false, secret: false },
  TRACE_RUN_ID: { description: "Identificador de corrida de tracing", type: "string", required: false, secret: false },
  TRACE_DIR: { description: "Directorio de traces", type: "string", required: false, secret: false },

  // --- coding-agent ---
  CODING_AGENT_MODELS_JSON: { description: "Ruta del models.json de Pi; relativa se resuelve contra el package", type: "string", required: false, secret: false },
  CODING_AGENT_AGENT_DIR: { description: "Directorio Pi del worker (default .pi/agent)", type: "string", required: false, secret: false },
  CODING_AGENT_PI_PACKAGES_DIR: { description: "Directorio de checkouts de paquetes Pi", type: "string", required: false, secret: false },
  CODING_AGENT_SUPERPOWERS_REF: { description: "Ref git de superpowers (clave dinámica en pi-packages)", type: "string", required: false, secret: false },

  // --- tracing ---
  TRACE_ENABLED: { description: "Activa el tracing", type: "boolean", required: false, secret: false, truthy: "1" },
  TRACE_RAW: { description: "Escribe raw.ndjson además de los segmentos", type: "boolean", required: false, secret: false, truthy: "1" },

  // --- system/framework ---
  NODE_ENV: { description: "Entorno Node; la provee el framework", type: "string", required: false, secret: false, managed: true },
  CI: { description: "Entorno CI; la provee el runtime", type: "boolean", required: false, secret: false, managed: true },
} as const satisfies Record<string, EnvVarSpec>;

export type EnvKey = keyof typeof ENV_CATALOG;

export function getSpec(key: EnvKey): EnvVarSpec {
  return ENV_CATALOG[key];
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm --filter config test:unit`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/config
git commit -m "feat(config): env catalog as single source of truth

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Fuente única de lectura (`source.ts`) + `ConfigError`

**Files:**
- Create: `packages/config/src/errors.ts`
- Create: `packages/config/src/source.ts`
- Test: `packages/config/tests/unit/source.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `readEnv(name: string): string | undefined`, `resolveSecret(name: string): string | undefined`, `ConfigError` (con `key` pública) — usados por builders (Task 4) y por `pi-packages.ts` (escape hatch).

- [ ] **Step 1: Escribir el test que falla** — `packages/config/tests/unit/source.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { readEnv, resolveSecret } from "../../src/source";

afterEach(() => vi.unstubAllEnvs());

describe("source (costura de lectura)", () => {
  it("readEnv devuelve el valor de process.env", () => {
    vi.stubEnv("CODING_AGENT_WORKER_PORT", "3015");
    expect(readEnv("CODING_AGENT_WORKER_PORT")).toBe("3015");
  });

  it("readEnv devuelve undefined cuando no está definida", () => {
    expect(readEnv("VAR_QUE_NO_EXISTE_12345")).toBeUndefined();
  });

  it("resolveSecret lee de process.env hoy (punto de inyección de systemd)", () => {
    // FUTURO (systemd credentials API): cuando la unidad declare
    // LoadCredential=meta_api_key, systemd expone $CREDENTIALS_DIRECTORY/meta_api_key.
    // La inyección ocurrirá aquí (y en readEnv): si CREDENTIALS_DIRECTORY está
    // definida y ${dir}/${key.toLowerCase()} existe, se lee primero ese archivo.
    vi.stubEnv("META_API_KEY", "sk-test");
    expect(resolveSecret("META_API_KEY")).toBe("sk-test");
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm --filter config test:unit`
Expected: FAIL — módulos no existen.

- [ ] **Step 3: Implementar `errors.ts` y `source.ts`**

```ts
// errors.ts
export class ConfigError extends Error {
  constructor(
    public readonly key: string,
    message: string,
  ) {
    super(`ConfigError[${key}]: ${message}`);
    this.name = "ConfigError";
  }
}
```

```ts
// source.ts
/**
 * ÚNICO módulo que lee variables de entorno.
 *
 * FUTURO (systemd credentials API):
 * Para entradas con secret:true, cuando la unidad declare LoadCredential=<name>
 * (p.ej. `LoadCredential=meta_api_key`), systemd expone $CREDENTIALS_DIRECTORY/<name>.
 * Inyección propuesta aquí (aplicar en readEnv y resolveSecret):
 *   const dir = process.env.CREDENTIALS_DIRECTORY;
 *   if (dir) → leer `${dir}/${name.toLowerCase()}` antes de process.env[name]
 * El catálogo (catalog.ts) ya discrimina secret vs no-secret para que el cambio
 * sea local a este archivo; los consumidores (config.*) no cambian.
 */
export function readEnv(name: string): string | undefined {
  return process.env[name];
}

/** Punto único por el que pasan TODOS los secretos. */
export function resolveSecret(name: string): string | undefined {
  return readEnv(name);
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm --filter config test:unit`
Expected: PASS (catalog + source tests).

- [ ] **Step 5: Commit**

```bash
git add packages/config
git commit -m "feat(config): single env source with systemd credential seam

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Builders tipados (`builders.ts`) + tests

**Files:**
- Create: `packages/config/src/builders.ts`
- Test: `packages/config/tests/unit/builders.test.ts`

**Interfaces:**
- Consumes: `getSpec`, `EnvKey` (Task 2); `readEnv`, `resolveSecret` (Task 3); `ConfigError` (Task 3).
- Produces:
  - `string(key): () => string` — required o con default; lanza si falta.
  - `stringOptional(key): () => string | undefined` — nunca lanza.
  - `secret(key): () => string` — required; lanza si falta; lee vía `resolveSecret`.
  - `secretOptional(key): () => string | undefined` — lee vía `resolveSecret`.
  - `int(key): () => number` — required o con default; lanza si falta o si no es entero.
  - `intOptional(key): () => number | undefined` — nunca lanza por ausencia.
  - `bool(key): () => boolean` — `truthy` exacto o presencia; ausente → false (o default).
  - `getAccessorRegistry(): AccessorRecord[]` — `{ key: EnvKey; kind: "string"|"stringOptional"|"secret"|"secretOptional"|"int"|"intOptional"|"bool" }[]`, registro interno para el test de cobertura (Task 5).

- [ ] **Step 1: Escribir el test que falla** — `packages/config/tests/unit/builders.test.ts`

> **Nota (decisión del plan):** los tests de builders mockean la costura `source` (`vi.mock("../../src/source")`) en vez de manipular `process.env`. Los builders solo dependen de `readEnv`/`resolveSecret`, así que controlar esas funciones hace los tests deterministas y agnósticos a las env vars del shell (los `vi.stubEnv` de la versión original fallaban en shells con vars del repo exportadas).

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { string, stringOptional, secret, secretOptional, int, intOptional, bool } from "../../src/builders";
import { readEnv, resolveSecret } from "../../src/source";
import { ConfigError } from "../../src/errors";

vi.mock("../../src/source", () => ({
  readEnv: vi.fn(),
  resolveSecret: vi.fn(),
}));

const mockReadEnv = vi.mocked(readEnv);
const mockResolveSecret = vi.mocked(resolveSecret);

beforeEach(() => {
  mockReadEnv.mockReset();
  mockResolveSecret.mockReset();
});

describe("builders", () => {
  describe("string", () => {
    it("lanza ConfigError cuando falta una requerida", () => {
      mockReadEnv.mockReturnValue(undefined);
      expect(() => string("CODING_AGENT_PROJECTS_ROOT")()).toThrow(ConfigError);
      expect(() => string("CODING_AGENT_PROJECTS_ROOT")()).toThrow(/CODING_AGENT_PROJECTS_ROOT/);
    });

    it("aplica el default del catálogo", () => {
      mockReadEnv.mockReturnValue(undefined);
      expect(stringOptional("CODING_AGENT_WORKER_URL")()).toBe("http://localhost:3015");
    });

    it("stringOptional devuelve undefined sin default ni valor", () => {
      mockReadEnv.mockReturnValue(undefined);
      expect(stringOptional("EVAL_BASE_URL")()).toBeUndefined();
    });
  });

  describe("secret", () => {
    it("lee via resolveSecret y lanza si falta", () => {
      mockResolveSecret.mockReturnValue("postgres://u:p@localhost:5432/db");
      expect(secret("POSTGRES_URL")()).toBe("postgres://u:p@localhost:5432/db");
      expect(() => secret("POSTGRES_URL")()).not.toThrow();
      mockResolveSecret.mockReturnValue(undefined);
      expect(() => secret("POSTGRES_URL")()).toThrow(ConfigError);
    });

    it("secretOptional devuelve undefined si falta", () => {
      mockResolveSecret.mockReturnValue(undefined);
      expect(secretOptional("META_API_KEY")()).toBeUndefined();
    });
  });

  describe("int", () => {
    it("parsea y aplica el default del catálogo", () => {
      mockReadEnv.mockReturnValue(undefined);
      expect(int("CODING_AGENT_WORKER_PORT")()).toBe(3015);
      mockReadEnv.mockReturnValue("4000");
      expect(int("CODING_AGENT_WORKER_PORT")()).toBe(4000);
    });

    it("lanza ConfigError si el valor no es un entero", () => {
      mockReadEnv.mockReturnValue("abc");
      expect(() => int("CODING_AGENT_WORKER_PORT")()).toThrow(ConfigError);
    });

    it("intOptional devuelve undefined sin default ni valor", () => {
      mockReadEnv.mockReturnValue(undefined);
      expect(intOptional("PORT")()).toBeUndefined();
      mockReadEnv.mockReturnValue("3100");
      expect(intOptional("PORT")()).toBe(3100);
    });
  });

  describe("bool", () => {
    it("compara con truthy exacto", () => {
      mockReadEnv.mockReturnValue("1");
      expect(bool("TRACE_ENABLED")()).toBe(true);
      mockReadEnv.mockReturnValue("true");
      expect(bool("TRACE_ENABLED")()).toBe(false); // truthy de TRACE_ENABLED es "1"
      mockReadEnv.mockReturnValue("true");
      expect(bool("CODING_AGENT_ENABLED")()).toBe(true); // truthy es "true"
    });

    it("sin truthy es presencia (raw !== '')", () => {
      mockReadEnv.mockReturnValue("1");
      expect(bool("CI")()).toBe(true);
      mockReadEnv.mockReturnValue("");
      expect(bool("CI")()).toBe(false);
    });

    it("ausente sin default → false", () => {
      mockReadEnv.mockReturnValue(undefined);
      expect(bool("DEBUG_CHUNKING")()).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm --filter config test:unit`
Expected: FAIL — `builders.ts` no existe.

- [ ] **Step 3: Implementar `packages/config/src/builders.ts`**

```ts
import { getSpec, type EnvKey } from "./catalog";
import { ConfigError } from "./errors";
import { readEnv, resolveSecret } from "./source";

export type AccessorKind =
  | "string" | "stringOptional"
  | "secret" | "secretOptional"
  | "int" | "intOptional"
  | "bool";

export interface AccessorRecord {
  key: EnvKey;
  kind: AccessorKind;
}

const REGISTRY: AccessorRecord[] = [];

/** Registro interno de accessors declarados; lo usa config.test para cobertura. */
export function getAccessorRegistry(): AccessorRecord[] {
  return [...REGISTRY];
}

function record(key: EnvKey, kind: AccessorKind): void {
  REGISTRY.push({ key, kind });
}

function raw(key: EnvKey): string | undefined {
  const spec = getSpec(key);
  return spec.secret ? resolveSecret(key) : readEnv(key);
}

function assertType(key: EnvKey, kind: AccessorKind, expected: EnvVarType): void {
  const spec = getSpec(key);
  if (spec.type !== expected) {
    throw new ConfigError(key, `builder ${kind}() usado con type=${spec.type}; esperaba ${expected}`);
  }
}

type EnvVarType = "string" | "number" | "boolean";

export function string(key: EnvKey): () => string {
  const spec = getSpec(key);
  assertType(key, "string", "string");
  record(key, "string");
  return () => {
    const value = raw(key);
    if (value !== undefined) return value;
    if (spec.default !== undefined) return String(spec.default);
    throw new ConfigError(key, `requerida y no definida (${spec.description})`);
  };
}

export function stringOptional(key: EnvKey): () => string | undefined {
  const spec = getSpec(key);
  assertType(key, "stringOptional", "string");
  record(key, "stringOptional");
  return () => {
    const value = raw(key);
    if (value !== undefined) return value;
    return spec.default !== undefined ? String(spec.default) : undefined;
  };
}

export function secret(key: EnvKey): () => string {
  const spec = getSpec(key);
  assertType(key, "secret", "string");
  if (!spec.secret) throw new ConfigError(key, "builder secret() usado con una variable no secreta");
  record(key, "secret");
  return () => {
    const value = resolveSecret(key);
    if (value !== undefined) return value;
    if (spec.default !== undefined) return String(spec.default);
    throw new ConfigError(key, `secreto requerido y no definido (${spec.description})`);
  };
}

export function secretOptional(key: EnvKey): () => string | undefined {
  const spec = getSpec(key);
  assertType(key, "secretOptional", "string");
  if (!spec.secret) throw new ConfigError(key, "builder secretOptional() usado con una variable no secreta");
  record(key, "secretOptional");
  return () => {
    const value = resolveSecret(key);
    if (value !== undefined) return value;
    return spec.default !== undefined ? String(spec.default) : undefined;
  };
}

export function int(key: EnvKey): () => number {
  const spec = getSpec(key);
  assertType(key, "int", "number");
  record(key, "int");
  return () => {
    const value = raw(key);
    if (value !== undefined) {
      const n = Number.parseInt(value, 10);
      if (Number.isNaN(n)) throw new ConfigError(key, `valor "${value}" no es un entero válido`);
      return n;
    }
    if (spec.default !== undefined) return Number(spec.default);
    throw new ConfigError(key, `requerida y no definida (${spec.description})`);
  };
}

export function intOptional(key: EnvKey): () => number | undefined {
  const spec = getSpec(key);
  assertType(key, "intOptional", "number");
  record(key, "intOptional");
  return () => {
    const value = raw(key);
    if (value !== undefined) {
      const n = Number.parseInt(value, 10);
      if (Number.isNaN(n)) throw new ConfigError(key, `valor "${value}" no es un entero válido`);
      return n;
    }
    return spec.default !== undefined ? Number(spec.default) : undefined;
  };
}

export function bool(key: EnvKey): () => boolean {
  const spec = getSpec(key);
  assertType(key, "bool", "boolean");
  record(key, "bool");
  return () => {
    const value = raw(key);
    if (value !== undefined) {
      return spec.truthy !== undefined ? value === spec.truthy : value !== "";
    }
    return spec.default !== undefined ? Boolean(spec.default) : false;
  };
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm --filter config test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/config
git commit -m "feat(config): typed env accessors with defaults and parsing

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Objeto semántico (`config.ts`) + cobertura + `optional()`

**Files:**
- Create: `packages/config/src/config.ts`
- Modify: `packages/config/src/index.ts` (exports públicos)
- Test: `packages/config/tests/unit/config.test.ts`

**Interfaces:**
- Consumes: builders (Task 4).
- Produces: `config` (objeto con accessors semánticos), `optional<T>(get: () => T): T | undefined`, y desde `index.ts`: `config`, `ENV_CATALOG`, `getSpec`, `EnvKey`, `EnvVarSpec`, `readEnv`, `resolveSecret`, `ConfigError`, `optional`, `getAccessorRegistry`.

- [ ] **Step 1: Escribir el test que falla** — `packages/config/tests/unit/config.test.ts`

> **Nota (decisión del plan):** igual que en Task 4, los tests mockean la costura `source` para ser deterministas y agnósticos a las env vars del shell.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config, optional } from "../../src/config";
import { ENV_CATALOG, type EnvKey } from "../../src/catalog";
import { getAccessorRegistry } from "../../src/builders";
import { readEnv, resolveSecret } from "../../src/source";
import { ConfigError } from "../../src/errors";

vi.mock("../../src/source", () => ({
  readEnv: vi.fn(),
  resolveSecret: vi.fn(),
}));

const mockReadEnv = vi.mocked(readEnv);
const mockResolveSecret = vi.mocked(resolveSecret);

beforeEach(() => {
  mockReadEnv.mockReset();
  mockResolveSecret.mockReset();
});

describe("config (objeto semántico)", () => {
  it("cubre todas las claves del catálogo con el builder kind correcto", () => {
    const registry = getAccessorRegistry();
    const byKey = new Map(registry.map((r) => [r.key, r.kind]));
    const catalogKeys = Object.keys(ENV_CATALOG) as EnvKey[];

    for (const key of catalogKeys) {
      const kind = byKey.get(key);
      expect(kind, `sin accessor para ${key}`).toBeDefined();
      const spec = ENV_CATALOG[key];
      if (spec.secret) {
        expect(["secret", "secretOptional"], key).toContain(kind);
      }
      if (spec.required) {
        expect(["string", "secret", "int"], key).toContain(kind);
      }
    }
  });

  it("aplica defaults del catálogo", () => {
    mockReadEnv.mockReturnValue(undefined);
    expect(config.codingAgentWorkerPort()).toBe(3015);
    expect(config.codingAgentWorkerUrl()).toBe("http://localhost:3015");
    expect(config.contextWindow()).toBe(128000);
  });

  it("booleans: ausente → false; truthy exacto", () => {
    mockReadEnv.mockReturnValue(undefined);
    expect(config.codingAgentEnabled()).toBe(false);
    mockReadEnv.mockReturnValue("true");
    expect(config.codingAgentEnabled()).toBe(true);
    mockReadEnv.mockReturnValue("1");
    expect(config.traceEnabled()).toBe(true);
  });

  it("lectura perezosa: refleja cambios entre llamadas", () => {
    mockReadEnv.mockReturnValue(undefined);
    expect(config.codingAgentWorkerPort()).toBe(3015);
    mockReadEnv.mockReturnValue("4100");
    expect(config.codingAgentWorkerPort()).toBe(4100);
    mockReadEnv.mockReturnValue(undefined);
    expect(config.codingAgentWorkerPort()).toBe(3015);
  });

  it("required lanza ConfigError con mensaje claro", () => {
    mockReadEnv.mockReturnValue(undefined);
    mockResolveSecret.mockReturnValue(undefined);
    expect(() => config.codingAgentProjectsRoot()).toThrow(ConfigError);
    expect(() => config.codingAgentProjectsRoot()).toThrow(/CODING_AGENT_PROJECTS_ROOT/);
    expect(() => config.postgresUrl()).toThrow(ConfigError);
  });

  it("optional() convierte un throw en undefined", () => {
    mockResolveSecret.mockReturnValue(undefined);
    expect(optional(() => config.postgresUrl())).toBeUndefined();
    mockResolveSecret.mockReturnValue("postgres://x");
    expect(optional(() => config.postgresUrl())).toBe("postgres://x");
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm --filter config test:unit`
Expected: FAIL — `config.ts` no existe.

- [ ] **Step 3: Implementar `packages/config/src/config.ts`**

```ts
import {
  bool, int, intOptional, secret, secretOptional, string, stringOptional,
} from "./builders";

/**
 * API pública del paquete. Cada accessor lee la variable en cada llamada
 * (perezoso): preserva vi.stubEnv en tests y el orden de carga de dotenv.
 * Requeridas ausentes → ConfigError al acceder. Nunca se lee process.env aquí.
 */
export const config = {
  // --- chatbot: gates y toggles ---
  codingAgentEnabled: bool("CODING_AGENT_ENABLED"),
  codingAgentProjectsRoot: string("CODING_AGENT_PROJECTS_ROOT"),
  codingAgentSessionsDir: string("CODING_AGENT_SESSIONS_DIR"),
  codingAgentWorkerUrl: stringOptional("CODING_AGENT_WORKER_URL"),
  codingAgentWorkerPort: int("CODING_AGENT_WORKER_PORT"),
  codingAgentAuthJson: stringOptional("CODING_AGENT_AUTH_JSON"),
  dbProvider: stringOptional("DB_PROVIDER"),
  dbDialect: stringOptional("DB_DIALECT"),
  contextWindow: int("DEFAULT_CONTEXT_WINDOW"),
  ragUploadLimit: stringOptional("RAG_UPLOAD_LIMIT"),
  debugChunking: bool("DEBUG_CHUNKING"),
  disableDevIndicator: bool("DISABLE_DEV_INDICATOR"),
  otelEnabled: bool("OTEL_ENABLED"),
  authTrustHost: bool("AUTH_TRUST_HOST"),
  evalBaseUrl: stringOptional("EVAL_BASE_URL"),
  serverOutput: bool("SERVER_OUTPUT"),
  port: intOptional("PORT"),
  privateBehavior: stringOptional("PRIVATE_BEHAVIOR"),
  traceRunId: stringOptional("TRACE_RUN_ID"),
  traceDir: stringOptional("TRACE_DIR"),

  // --- chatbot: secretos ---
  postgresUrl: secret("POSTGRES_URL"),
  metaApiKey: secretOptional("META_API_KEY"),
  opencodeZenApiKey: secretOptional("OPENCODE_ZEN_API_KEY"),
  deepInfraApiKey: secretOptional("DEEPINFRA_API_KEY"),
  exaSearchApiKey: secretOptional("EXASEARCH_API_KEY"),
  exaApiKey: secretOptional("EXA_API_KEY"),
  mcpApiKey: secretOptional("MCP_API_KEY"),
  authSecret: secretOptional("AUTH_SECRET"),

  // --- coding-agent ---
  codingAgentModelsJson: stringOptional("CODING_AGENT_MODELS_JSON"),
  codingAgentAgentDir: stringOptional("CODING_AGENT_AGENT_DIR"),
  codingAgentPiPackagesDir: stringOptional("CODING_AGENT_PI_PACKAGES_DIR"),

  // --- tracing ---
  traceEnabled: bool("TRACE_ENABLED"),
  traceRaw: bool("TRACE_RAW"),

  // --- system/framework ---
  nodeEnv: stringOptional("NODE_ENV"),
  ci: bool("CI"),
} as const;

/** Convierte un acceso throwing (requerida ausente) en undefined. */
export function optional<T>(get: () => T): T | undefined {
  try {
    return get();
  } catch {
    return undefined;
  }
}
```

> **Nota de cobertura:** `CODING_AGENT_SUPERPOWERS_REF` no tiene accessor semántico (es clave dinámica por paquete). Para que el test de cobertura pase, se lee vía `readEnv` en `pi-packages.ts` (Task 7) y se declara como excluida aquí: añade al final de `config.ts`:

```ts
/** Claves dinámicas que se leen vía readEnv (escape hatch documentado). */
export const DYNAMIC_ENV_KEYS: EnvKey[] = ["CODING_AGENT_SUPERPOWERS_REF"];
```

- [ ] **Step 4: Ajustar el test de cobertura para las claves dinámicas**

En `config.test.ts`, en el test "cubre todas las claves", antes del `for`, añade:

```ts
const dynamic = new Set(DYNAMIC_ENV_KEYS);
```

y dentro del `for`, tras `const spec = ENV_CATALOG[key];`, salta las dinámicas:

```ts
if (dynamic.has(key)) continue;
```

Importa `DYNAMIC_ENV_KEYS` en el test.

- [ ] **Step 5: Actualizar `packages/config/src/index.ts`**

```ts
export { ENV_CATALOG, getSpec } from "./catalog";
export type { EnvKey, EnvVarSpec } from "./catalog";
export { readEnv, resolveSecret } from "./source";
export { ConfigError } from "./errors";
export { getAccessorRegistry } from "./builders";
export type { AccessorKind, AccessorRecord } from "./builders";
export { config, optional, DYNAMIC_ENV_KEYS } from "./config";
```

- [ ] **Step 6: Ejecutar tests y verificar que pasan**

Run: `pnpm --filter config test:unit && pnpm --filter config type:check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/config
git commit -m "feat(config): semantic config object with coverage guarantees

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Migrar `tracing`

**Files:**
- Modify: `packages/tracing/package.json` (add `"config": "workspace:*"`)
- Modify: `packages/tracing/src/types.ts:93` (`isTracingEnabled`)
- Modify: `packages/tracing/src/sink.ts:93,150` (`TRACE_DIR`, `TRACE_RAW`)
- Modify: `packages/tracing/src/model-middleware.ts:98` (`TRACE_RUN_ID`)
- Modify: `packages/tracing/src/inspector.ts:15` (`TRACE_DIR`, CLI)

**Interfaces:**
- Consumes: `config.traceEnabled()`, `config.traceDir()`, `config.traceRaw()`, `config.traceRunId()` (Task 5).
- Produces: tracing sin `process.env` en `src/` (0 hits).

- [ ] **Step 1: Añadir la dependencia `config` a `packages/tracing/package.json`**

Añadir al objeto `"dependencies"`:

```json
"config": "workspace:*"
```

Run: `pnpm install` (actualiza lockfile).

- [ ] **Step 2: Migrar `types.ts`**

`packages/tracing/src/types.ts:93`:

```ts
// antes
export function isTracingEnabled(): boolean {
  return process.env.TRACE_ENABLED === "1";
}
// después
import { config } from "config";

export function isTracingEnabled(): boolean {
  return config.traceEnabled();
}
```

- [ ] **Step 3: Migrar `sink.ts`**

`packages/tracing/src/sink.ts:93`:

```ts
// antes
const baseTraceDir =
  opts.traceDir ?? process.env.TRACE_DIR ?? DEFAULT_TRACE_DIR;
// después
const baseTraceDir =
  opts.traceDir ?? config.traceDir() ?? DEFAULT_TRACE_DIR;
```

`packages/tracing/src/sink.ts:150`:

```ts
// antes
if (process.env.TRACE_RAW === "1") {
// después
if (config.traceRaw()) {
```

Añadir `import { config } from "config";` arriba.

- [ ] **Step 4: Migrar `model-middleware.ts`**

`packages/tracing/src/model-middleware.ts:98`:

```ts
// antes
runId: ctx?.runId ?? process.env.TRACE_RUN_ID ?? "unknown",
// después
runId: ctx?.runId ?? config.traceRunId() ?? "unknown",
```

Añadir el import de `config`.

- [ ] **Step 5: Migrar `inspector.ts` (CLI)**

`packages/tracing/src/inspector.ts:15`:

```ts
// antes
const TRACE_DIR = process.env.TRACE_DIR ?? resolve(__dirname, "../traces");
// después
const TRACE_DIR = config.traceDir() ?? resolve(__dirname, "../traces");
```

Añadir el import de `config`. (El CLI lee en scope de módulo; es aceptable porque es un script.)

- [ ] **Step 6: Verificar**

Run: `pnpm --filter tracing type:check && rg -n "process\.env" packages/tracing/src`
Expected: type:check OK; `rg` = 0 hits.

Run: `pnpm test:integration` (los tests de chatbot/coding-agent ejercitan tracing con `TRACE_ENABLED=1`).
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/tracing pnpm-lock.yaml
git commit -m "refactor(tracing): read env vars via config package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Migrar `coding-agent`

**Files:**
- Modify: `packages/coding-agent/package.json` (add `"config": "workspace:*"`)
- Modify: `packages/coding-agent/src/models.ts:7,14`
- Modify: `packages/coding-agent/src/paths.ts:25`
- Modify: `packages/coding-agent/src/pi-packages.ts:45,55`
- Modify: `packages/coding-agent/src/session-manager.ts:354,355,487,499,610,1497,1508`
- Modify: `packages/coding-agent/src/transports/http.ts:558`

**Interfaces:**
- Consumes: `config.codingAgentModelsJson()`, `config.codingAgentAuthJson()`, `config.codingAgentAgentDir()`, `config.codingAgentPiPackagesDir()`, `config.codingAgentProjectsRoot()`, `config.codingAgentSessionsDir()`, `config.codingAgentWorkerPort()`, `readEnv`, `optional` (Task 5).
- Produces: coding-agent sin `process.env` en `src/` (0 hits). Nota: `resolveOverride` (paths.ts) NO cambia — recibe el valor ya resuelto por el accessor.

- [ ] **Step 1: Añadir la dependencia `config` a `packages/coding-agent/package.json`**

```json
"config": "workspace:*"
```

Run: `pnpm install`.

- [ ] **Step 2: Migrar `models.ts`**

```ts
// antes
export function getModelsJsonPath(): string {
  return resolveOverride(
    process.env.CODING_AGENT_MODELS_JSON,
    path.join(getCodingAgentDir(), "models.json"),
  );
}
// después
export function getModelsJsonPath(): string {
  return resolveOverride(
    config.codingAgentModelsJson(),
    path.join(getCodingAgentDir(), "models.json"),
  );
}
```

Igual para `getAuthJsonPath()` con `config.codingAgentAuthJson()`. Añadir `import { config } from "config";`.

- [ ] **Step 3: Migrar `paths.ts`**

```ts
// antes
export function getCodingAgentDir(): string {
  return resolveOverride(
    process.env.CODING_AGENT_AGENT_DIR,
    path.join(PACKAGE_ROOT, ".pi", "agent"),
  );
}
// después
export function getCodingAgentDir(): string {
  return resolveOverride(
    config.codingAgentAgentDir(),
    path.join(PACKAGE_ROOT, ".pi", "agent"),
  );
}
```

Añadir el import de `config`.

- [ ] **Step 4: Migrar `pi-packages.ts`**

```ts
// antes (línea 45)
export function getPiPackagesDir(): string {
  return resolveOverride(
    process.env.CODING_AGENT_PI_PACKAGES_DIR,
    path.join(PACKAGE_ROOT, ".pi", "packages"),
  );
}
// después
export function getPiPackagesDir(): string {
  return resolveOverride(
    config.codingAgentPiPackagesDir(),
    path.join(PACKAGE_ROOT, ".pi", "packages"),
  );
}
```

```ts
// antes (línea 55) — clave dinámica: escape hatch readEnv documentado
export function getPiPackageRef(pkg: PiPackage): string {
  return process.env[pkg.refEnvVar]?.trim() || pkg.defaultRef;
}
// después
export function getPiPackageRef(pkg: PiPackage): string {
  return readEnv(pkg.refEnvVar)?.trim() || pkg.defaultRef;
}
```

Imports: `import { config, readEnv } from "config";`

- [ ] **Step 5: Migrar `session-manager.ts`** (7 sitios)

| Línea | Antes | Después |
|---|---|---|
| 354 | `const sessionsDir = process.env.CODING_AGENT_SESSIONS_DIR!;` | `const sessionsDir = config.codingAgentSessionsDir();` |
| 355 | `const projectsRoot = process.env.CODING_AGENT_PROJECTS_ROOT!;` | `const projectsRoot = config.codingAgentProjectsRoot();` |
| 487 | `const projectsRoot = process.env.CODING_AGENT_PROJECTS_ROOT!;` | `const projectsRoot = config.codingAgentProjectsRoot();` |
| 499 | `process.env.CODING_AGENT_SESSIONS_DIR!,` | `config.codingAgentSessionsDir(),` |
| 610 | `const root = process.env.CODING_AGENT_PROJECTS_ROOT;` | `const root = optional(() => config.codingAgentProjectsRoot());` |
| 1497 | `const projectsRoot = process.env.CODING_AGENT_PROJECTS_ROOT!;` | `const projectsRoot = config.codingAgentProjectsRoot();` |
| 1508 | `ensureSubagentSessionsDir(process.env.CODING_AGENT_SESSIONS_DIR!),` | `ensureSubagentSessionsDir(config.codingAgentSessionsDir()),` |

Añadir `import { config, optional } from "config";`.

- [ ] **Step 6: Migrar `transports/http.ts`**

```ts
// antes
function parsePort(): number {
  return parseInt(process.env.CODING_AGENT_WORKER_PORT ?? "3015", 10);
}
// después
function parsePort(): number {
  return config.codingAgentWorkerPort();
}
```

Añadir el import de `config`.

- [ ] **Step 7: Verificar**

Run: `pnpm --filter coding-agent type:check && rg -n "process\.env" packages/coding-agent/src`
Expected: type:check OK; `rg` = 0 hits.

Run: `pnpm --filter coding-agent test:unit && pnpm --filter coding-agent test:integration && pnpm --filter coding-agent test:contract`
Expected: PASS (los helpers de test fijan `process.env` directamente; la lectura perezosa los respeta).

- [ ] **Step 8: Commit**

```bash
git add packages/coding-agent pnpm-lock.yaml
git commit -m "refactor(coding-agent): read env vars via config package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Migrar `chatbot` — infraestructura y tooling

**Files:**
- Modify: `packages/chatbot/package.json` (add `"config": "workspace:*"`)
- Modify: `packages/chatbot/lib/infrastructure/ai/providers.ts:29,42,57`
- Modify: `packages/chatbot/lib/infrastructure/db/db.ts:52-53,63`
- Modify: `packages/chatbot/lib/infrastructure/db/migrate.ts:10,14`
- Modify: `packages/chatbot/lib/features/auth/auth-config.ts:89`
- Modify: `packages/chatbot/mcp-server/index.ts:78`
- Modify: `packages/chatbot/instrumentation.ts:6`
- Modify: `packages/chatbot/next.config.ts:4`
- Modify: `packages/chatbot/drizzle.config.ts:17`
- Modify: `packages/chatbot/scripts/eval-runner.ts:281-283`
- Modify: `packages/chatbot/scripts/seed-test-data.ts:125,129`
- Modify: `packages/chatbot/playwright.config.ts:14,33,35,97,98,100` (el bloque `env:` de reenvío queda con `process.env` + comentario, deviation 1)

**Interfaces:**
- Consumes: `config.postgresUrl()`, `config.metaApiKey()`, `config.opencodeZenApiKey()`, `config.deepInfraApiKey()`, `config.dbProvider()`, `config.dbDialect()`, `config.authTrustHost()`, `config.mcpApiKey()`, `config.otelEnabled()`, `config.nodeEnv()`, `config.disableDevIndicator()`, `config.port()`, `config.ci()`, `config.serverOutput()`, `config.evalBaseUrl()`, `config.traceDir()`, `optional()` (Task 5).

- [ ] **Step 1: Añadir la dependencia `config` a `packages/chatbot/package.json`**

```json
"config": "workspace:*"
```

Run: `pnpm install`.

- [ ] **Step 2: Migrar `providers.ts`**

```ts
// antes
apiKey: process.env.OPENCODE_ZEN_API_KEY,      // línea 29
apiKey: process.env.META_API_KEY,              // línea 42
apiKey: process.env.DEEPINFRA_API_KEY,         // línea 57
// después
apiKey: config.opencodeZenApiKey(),
apiKey: config.metaApiKey(),
apiKey: config.deepInfraApiKey(),
```

Añadir `import { config } from "config";`.

- [ ] **Step 3: Migrar `db/db.ts`**

```ts
// antes (líneas 52-53)
process.env.DB_PROVIDER === "pglite" ||
process.env.DB_DIALECT === "pglite";
// después
config.dbProvider() === "pglite" ||
config.dbDialect() === "pglite";
```

```ts
// antes (línea 63)
const client = postgres(process.env.POSTGRES_URL!);
// después
const client = postgres(config.postgresUrl());
```

Añadir el import de `config`.

- [ ] **Step 4: Migrar `db/migrate.ts`**

```ts
// antes
if (!process.env.POSTGRES_URL) {
// después
if (!optional(() => config.postgresUrl())) {
```

```ts
// antes
const connection = postgres(process.env.POSTGRES_URL, { max: 1 });
// después
const connection = postgres(optional(() => config.postgresUrl())!, { max: 1 });
```

Añadir `import { config, optional } from "config";`.

- [ ] **Step 5: Migrar `auth-config.ts`**

```ts
// antes (línea 89)
...(process.env.AUTH_TRUST_HOST === "true" && {
// después
...(config.authTrustHost() && {
```

Añadir el import de `config`.

- [ ] **Step 6: Migrar `mcp-server/index.ts`**

```ts
// antes (línea 78)
const apiKey = process.env.MCP_API_KEY;
// después
const apiKey = config.mcpApiKey();
```

Añadir el import de `config`.

- [ ] **Step 7: Migrar `instrumentation.ts`**

```ts
// antes (línea 6)
const isEnabled = process.env.OTEL_ENABLED === '1' || process.env.NODE_ENV === 'production'
// después
const isEnabled = config.otelEnabled() || config.nodeEnv() === 'production'
```

Añadir el import de `config`.

- [ ] **Step 8: Migrar `next.config.ts`**

```ts
// antes (línea 4)
const disableDevIndicators = process.env.DISABLE_DEV_INDICATOR === "1";
// después
import { config } from "config";
const disableDevIndicators = config.disableDevIndicator();
```

- [ ] **Step 9: Migrar `drizzle.config.ts`**

```ts
// antes (línea 17)
url: process.env.POSTGRES_URL!,
// después
url: config.postgresUrl(),
```

Añadir el import de `config` (la línea 6 con `NEXT_PUBLIC_ENV` NO se toca). Ojo: `drizzle.config.ts` corre con `tsx`; importar `config` (TS ESM) funciona igual que `models`/`tracing`.

- [ ] **Step 10: Migrar `scripts/eval-runner.ts`** (logging, con `optional` para no lanzar al imprimir)

```ts
// antes (líneas 281-283)
console.log(`POSTGRES_URL: ${process.env.POSTGRES_URL}`);
console.log(`TRACE_DIR:   ${process.env.TRACE_DIR}`);
console.log(`EVAL_BASE_URL: ${process.env.EVAL_BASE_URL}\n`);
// después
console.log(`POSTGRES_URL: ${optional(() => config.postgresUrl()) ?? "undefined"}`);
console.log(`TRACE_DIR:   ${config.traceDir() ?? "undefined"}`);
console.log(`EVAL_BASE_URL: ${config.evalBaseUrl() ?? "undefined"}\n`);
```

Añadir `import { config, optional } from "config";`.

- [ ] **Step 11: Migrar `scripts/seed-test-data.ts`**

```ts
// antes (líneas 125,129)
if (!process.env.POSTGRES_URL) {
// después
if (!optional(() => config.postgresUrl())) {
```

```ts
// antes
const client = postgres(process.env.POSTGRES_URL, { max: 1 });
// después
const client = postgres(optional(() => config.postgresUrl())!, { max: 1 });
```

Añadir el import.

- [ ] **Step 12: Migrar `playwright.config.ts`** (lecturas; NO el bloque `env:`)

```ts
// antes (línea 14)
const PORT = process.env.PORT || 3000;
// después
const PORT = config.port() ?? 3000;
```

```ts
// antes (líneas 33,35,100)
forbidOnly: !!process.env.CI,
retries: process.env.CI ? 1 : 0,
reuseExistingServer: !process.env.CI,
// después
forbidOnly: config.ci(),
retries: config.ci() ? 1 : 0,
reuseExistingServer: !config.ci(),
```

```ts
// antes (líneas 97-98)
stdout: !!process.env.SERVER_OUTPUT ? "pipe" : "ignore",
stderr: !!process.env.SERVER_OUTPUT ? "pipe" : "ignore",
// después
stdout: config.serverOutput() ? "pipe" : "ignore",
stderr: config.serverOutput() ? "pipe" : "ignore",
```

El bloque `env: { ... }` (líneas 105-110) queda IGUAL, con este comentario encima:

```ts
// Reenvío de valores crudos al webServer (strings, defaults propios del runner).
// A propósito NO usa config: aquí se plumbearn a un proceso hijo, no se leen
// para la lógica de la app. Ver docs/superpowers/specs/2026-08-10-centralized-env-config-design.md.
```

Añadir `import { config } from "config";`.

- [ ] **Step 13: Verificar**

Run: `pnpm --filter chatbot type:check && pnpm --filter chatbot test:unit`
Expected: PASS. Si algún test unitario dependía de lectura en import-time de `DEFAULT_CONTEXT_WINDOW`/`POSTGRES_URL` (poco probable), ajustar el test a `vi.stubEnv` antes de la llamada, no del import.

- [ ] **Step 14: Commit**

```bash
git add packages/chatbot pnpm-lock.yaml
git commit -m "refactor(chatbot): read env vars via config package (infra & tooling)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Migrar `chatbot` — app, rutas y features

**Files:**
- Modify: `packages/chatbot/app/(auth)/register/page.tsx:8`
- Modify: `packages/chatbot/app/(chat)/agent/code/page.tsx:16`
- Modify: `packages/chatbot/app/(chat)/agent/code/[project]/[sessionId]/page.tsx:23`
- Modify: `packages/chatbot/app/(chat)/agent/code/[project]/[sessionId]/files/page.tsx:31`
- Modify: `packages/chatbot/app/(chat)/agent/code/[project]/[sessionId]/subagent/[subSessionId]/page.tsx:15`
- Modify: `packages/chatbot/app/(chat)/api/agent/code/[project]/changes/route.ts:31,34`
- Modify: `packages/chatbot/app/(chat)/api/agent/code/[project]/files/route.ts:95,98`
- Modify: `packages/chatbot/app/(chat)/api/agent/code/worker-stub/rpc/route.ts:18`
- Modify: `packages/chatbot/app/(chat)/api/chat/route.ts:46`
- Modify: `packages/chatbot/components/layout/sidebar/agent-code-nav.tsx:6`
- Modify: `packages/chatbot/lib/features/code/actions.ts:21,68`
- Modify: `packages/chatbot/lib/features/code/worker-client.ts:83`
- Modify: `packages/chatbot/lib/features/chat/conversation/factory.ts:85,283`
- Modify: `packages/chatbot/lib/features/compaction/types.ts:8` (eliminar `DEFAULT_CONTEXT_WINDOW`)
- Modify: `packages/chatbot/lib/features/compaction/orchestration.ts:65`
- Modify: `packages/chatbot/lib/features/rag/actions.ts:119`
- Modify: `packages/chatbot/lib/features/rag/ingestion/chunking.ts:258`
- Modify: `packages/chatbot/lib/features/web-search/tools.ts:16`

**Interfaces:**
- Consumes: `config.codingAgentEnabled()`, `config.codingAgentProjectsRoot()`, `config.nodeEnv()`, `config.traceRunId()`, `config.codingAgentWorkerUrl()`, `config.contextWindow()`, `config.ragUploadLimit()`, `config.debugChunking()`, `config.exaSearchApiKey()`, `config.exaApiKey()`, `config.privateBehavior()`, `optional()` (Task 5).

- [ ] **Step 1: Migrar los 5 gates de páginas del agente de código**

Los 5 archivos (`page.tsx:16`, `[sessionId]/page.tsx:23`, `[sessionId]/files/page.tsx:31`, `subagent/.../page.tsx:15`, `agent-code-nav.tsx:6`) usan el mismo patrón. En cada uno:

```ts
// antes
if (process.env.CODING_AGENT_ENABLED !== "true") return notFound();
// después
if (!config.codingAgentEnabled()) return notFound();
```

(`agent-code-nav.tsx:6` usa `return null;` en vez de `notFound()`.) Añadir `import { config } from "config";` en cada archivo.

- [ ] **Step 2: Migrar `changes/route.ts` y `files/route.ts`** (gate + lectura defensiva)

```ts
// antes
if (process.env.CODING_AGENT_ENABLED !== "true") {
  return new Response("Not found", { status: 404 });
}
const root = process.env.CODING_AGENT_PROJECTS_ROOT;
if (!root) {
  return new Response("Not found", { status: 404 });
}
// después
if (!config.codingAgentEnabled()) {
  return new Response("Not found", { status: 404 });
}
const root = optional(() => config.codingAgentProjectsRoot());
if (!root) {
  return new Response("Not found", { status: 404 });
}
```

Añadir `import { config, optional } from "config";` en ambos.

- [ ] **Step 3: Migrar `worker-stub/rpc/route.ts`** (solo `NODE_ENV`)

```ts
// antes (línea 18)
if (process.env.NEXT_PUBLIC_ENV !== "test" && process.env.NODE_ENV !== "test") {
// después (NEXT_PUBLIC_ENV NO se toca)
if (process.env.NEXT_PUBLIC_ENV !== "test" && config.nodeEnv() !== "test") {
```

- [ ] **Step 4: Migrar `api/chat/route.ts`**

```ts
// antes (línea 46)
const runId = process.env.TRACE_RUN_ID ?? "default";
// después
const runId = config.traceRunId() ?? "default";
```

- [ ] **Step 5: Migrar `lib/features/code/actions.ts`**

```ts
// antes (línea 21)
if (process.env.CODING_AGENT_ENABLED !== "true") {
// después
if (!config.codingAgentEnabled()) {
```

```ts
// antes (línea 68)
const root = process.env.CODING_AGENT_PROJECTS_ROOT;
// después
const root = optional(() => config.codingAgentProjectsRoot());
```

(La línea 64 con `NEXT_PUBLIC_ENV` NO se toca.) Añadir el import.

- [ ] **Step 6: Migrar `worker-client.ts`**

```ts
// antes (línea 83)
this.baseUrl = baseUrl ?? process.env.CODING_AGENT_WORKER_URL ?? "http://localhost:3015";
// después (default del catálogo)
this.baseUrl = baseUrl ?? config.codingAgentWorkerUrl();
```

Añadir el import de `config`.

- [ ] **Step 7: Migrar `conversation/factory.ts`** (2 sitios)

```ts
// antes (línea 85)
process.env.TRACE_RUN_ID ?? "default",
// después
config.traceRunId() ?? "default",
```

```ts
// antes (línea 283)
modelConfig.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
// después
modelConfig.contextWindow ?? config.contextWindow();
```

Añadir el import de `config`; quitar `DEFAULT_CONTEXT_WINDOW` del import de `compaction/types` si quedaba.

- [ ] **Step 8: Migrar `compaction/types.ts` + `orchestration.ts`**

En `types.ts:8`, ELIMINAR el const (la lectura en import-time desaparece):

```ts
// antes
export const DEFAULT_CONTEXT_WINDOW = parseInt(
  process.env.DEFAULT_CONTEXT_WINDOW ?? "128000",
  10,
);
// después
// (eliminado: usar config.contextWindow(), packages/config)
```

En `orchestration.ts:65`:

```ts
// antes
const contextWindow = settings.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
// después
const contextWindow = settings.contextWindow ?? config.contextWindow();
```

Verificar con `rg -n "DEFAULT_CONTEXT_WINDOW" packages/chatbot --type ts -g '!tests'` que no quedan referencias en `src/`/`app/`/`lib/`.

- [ ] **Step 9: Migrar `rag/actions.ts`**

```ts
// antes (línea 119)
if (process.env.RAG_UPLOAD_LIMIT !== "false" && urls.length > 200) {
// después
if (config.ragUploadLimit() !== "false" && urls.length > 200) {
```

- [ ] **Step 10: Migrar `chunking.ts`**

```ts
// antes (línea 258)
if (process.env.DEBUG_CHUNKING !== "true" || !title) return;
// después
if (!config.debugChunking() || !title) return;
```

- [ ] **Step 11: Migrar `web-search/tools.ts`**

```ts
// antes (línea 16)
const key = process.env.EXASEARCH_API_KEY || process.env.EXA_API_KEY;
// después (la cadena de alias se mantiene en el consumidor, como decidió el spec)
const key = config.exaSearchApiKey() || config.exaApiKey();
```

- [ ] **Step 12: Migrar `register/page.tsx`**

```ts
// antes (línea 8)
if (process.env.PRIVATE_BEHAVIOR !== "enabled") {
// después
if (config.privateBehavior() !== "enabled") {
```

- [ ] **Step 13: Verificar**

Run: `pnpm --filter chatbot type:check && pnpm --filter chatbot test:unit && pnpm --filter chatbot test:component && pnpm --filter chatbot test:integration`
Expected: PASS.

Criterio de salida: `rg -n "process\.env" packages/chatbot/app packages/chatbot/lib packages/chatbot/components packages/chatbot/scripts packages/chatbot/mcp-server packages/chatbot/instrumentation.ts packages/chatbot/next.config.ts packages/chatbot/drizzle.config.ts packages/chatbot/playwright.config.ts packages/coding-agent/src packages/tracing/src` (nota: `packages/chatbot/src` no existe en este repo — el código de la app vive en `app`/`lib`/`components`)
Solo deben quedar: `NEXT_PUBLIC_ENV` (permitido), el bloque `env:` de playwright (permitido, comentado), los writes/forwarding de `eval-runner.ts` (`Object.assign(process.env, ...)` y `env: process.env` — plumbing a proceso hijo, permitido) y `lib/infrastructure/env.ts` (permitido).

- [ ] **Step 14: Commit**

```bash
git add packages/chatbot
git commit -m "refactor(chatbot): read env vars via config package (app & features)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Documentación (`AGENTS.md`) + verificación final

**Files:**
- Modify: `AGENTS.md` (estructura del monorepo + nota de env vars)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Actualizar `AGENTS.md`**

Añadir `config/` al árbol de `packages/`:

```markdown
packages/
├── chatbot/        # Main Next.js web application
├── coding-agent/   # Coding agent HTTP worker
├── config/         # Central env catalog + typed config accessors (no process.env en src/)
├── model-registry/ # Single-source model catalog
├── models/         # ... (según el estado actual del árbol)
└── tracing/        # Shared tracing/observability library
```

Añadir una sección corta después de la estructura:

```markdown
### `config` — Central Env Config

Catálogo único de variables de entorno (`ENV_CATALOG` en `packages/config/src/catalog.ts`)
y acceso tipado vía el objeto semántico `config` (`packages/config/src/config.ts`).

Regla: en `src/` de cualquier paquete NO se usa `process.env` directamente; se importa
`config` (o `readEnv` para claves dinámicas documentadas). Las variables `NEXT_PUBLIC_*`
quedan fuera (Next.js las inlinea en build). El paquete deja marcada la evolución a la
credentials API de systemd en `packages/config/src/source.ts`.
```

- [ ] **Step 2: Verificación final**

Run: `pnpm verify:fast`
Expected: lint + type:check + unit + component + integration + contract, todo PASS.

Run (criterio de salida global):

```bash
rg -n "process\.env" packages/chatbot/src packages/coding-agent/src packages/tracing/src
```

Expected: 0 hits.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document central env config package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

**Cobertura del spec:**
- Catálogo declarativo → Task 2 ✓
- Acceso tipado vía objeto semántico → Task 5 ✓
- Sin fail-fast al arranque (errores solo al acceder) → builders lanzan en el accessor, no en import (Task 4) ✓
- Costura de secretos documentada (`source.ts` + test) → Task 3 ✓
- Migración tracing/coding-agent/chatbot → Tasks 6-9 ✓
- Criterio de salida `rg process.env` en src/ = 0 → Tasks 6-9 + verificación en 10 ✓
- Exclusiones (NEXT_PUBLIC_*, `lib/infrastructure/env.ts`, tests) → respetadas en cada tarea ✓
- Lectura perezosa (vi.stubEnv) → builders leen en cada llamada (Task 4) ✓
- `optional()` para lecturas defensivas de requeridas → Task 5 + usado en 7, 8, 9 ✓

**Consistencia de tipos:** los nombres de accessors de `config.ts` (Task 5) son los que usan Tasks 6-9; `readEnv`/`optional`/`ConfigError` se exportan desde `index.ts` (Task 5, Step 5) antes de que los consumidores los importen. `CODING_AGENT_SUPERPOWERS_REF` se declara en `DYNAMIC_ENV_KEYS` (Task 5) y se lee con `readEnv` (Task 7) — el test de cobertura lo excluye explícitamente.
