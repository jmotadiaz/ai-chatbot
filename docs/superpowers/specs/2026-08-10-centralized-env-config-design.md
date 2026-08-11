# Diseño: Paquete central de configuración de entorno (`packages/config`)

**Fecha:** 2026-08-10
**Estado:** borrador para revisión

## Objetivo

Centralizar el acceso a variables de entorno de todo el monorepo (excepto `NEXT_PUBLIC_*`) en un nuevo paquete compartido, para:

1. **Poner orden:** que exista una única lista declarativa (catálogo) con todas las variables: tipo, requerida, secreto, default, descripción y dueño. Hoy ~30 variables se leen con `process.env.X` directo en ~15+ archivos fuente repartidos entre `chatbot`, `coding-agent` y `tracing`, sin ningún registro central.
2. **Evolucionar fácilmente a la credentials API de systemd:** que el paquete exponga una API estable y deje una costura interna explícita (un único resolver de secretos), de modo que en el futuro las credenciales puedan leerse de `$CREDENTIALS_DIRECTORY` sin tocar a los consumidores.

## Restricciones (decididas en brainstorming)

| # | Decisión |
|---|----------|
| 1 | Alcance: todo el monorepo excepto `NEXT_PUBLIC_*` (Next.js las inlinea en build-time; su flujo —`isTestMode`, `isEvalMode`, `resolveEnvFile`— permanece en `chatbot/lib/infrastructure/env.ts`) |
| 2 | Responsabilidades: catálogo + **acceso tipado en runtime** vía objeto semántico (`config.metaApiKey()`). **Sin** validación fail-fast al arranque. **Sin** resolución multi-fuente todavía |
| 3 | Systemd: frontera de API estable + **costura interna de secretos documentada** (un único resolver; test/doc que marque dónde se inyectará `$CREDENTIALS_DIRECTORY/name`) |
| 4 | Enfoque de API: **objeto semántico curado** (`config.workerPort()`, `config.metaApiKey()`), con el catálogo como fuente única de metadatos |

## Arquitectura

```
packages/config/
├── package.json        # name: "config", sin build (main: ./src/index.ts), patrón packages/tracing
├── tsconfig.json       # mismo patrón que packages/tracing
├── src/
│   ├── catalog.ts      # datos puros: lista declarativa de todas las variables (fuente única de metadatos)
│   ├── source.ts       # COSTURA: único módulo que toca process.env (readEnv). Aquí se inyectará systemd
│   ├── builders.ts     # factories tipadas: string() / secret() / int() / bool() — validan contra el catálogo
│   ├── config.ts       # objeto semántico: config.metaApiKey, config.workerPort, ...
│   └── index.ts        # exporta config, catalog, tipos
└── tests/
    ├── catalog.test.ts    # integridad del catálogo
    ├── config.test.ts     # comportamiento de getters (defaults, errores, parsing)
    └── source.test.ts     # costura: lee de process.env hoy; marca el punto de inyección futuro
```

**Flujo de datos:** `config.ts` declara cada accessor con un builder → el builder valida en compile-time que la key exista en `catalog.ts` y en runtime que el valor parseado cumpla el tipo → la lectura real ocurre vía `source.ts` (`readEnv(name)`), de forma **perezosa** (en cada llamada, no al importar el módulo).

**Dependencias:** `chatbot`, `coding-agent` y `tracing` añaden `"config": "workspace:*"`. Ningún consumidor vuelve a tocar `process.env`.

## Modelo de catálogo

```ts
// src/catalog.ts — datos puros, sin lectura de entorno
export interface EnvVarSpec {
  description: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  secret: boolean;          // true → el accessor pasa por resolveSecret
  default?: string | number; // valor usado cuando no está definida
  truthy?: string;           // para type:"boolean": qué valor cuenta como true (ej. "1", "true")
  managed?: boolean;         // true → la provee el runtime/framework (NODE_ENV, CI), no se define a mano
}

export const ENV_CATALOG = { ... } as const satisfies Record<string, EnvVarSpec>;
export type EnvKey = keyof typeof ENV_CATALOG;
```

## Inventario del catálogo (estado actual verificado)

### Secretos (`secret: true`)
| Variable | Dueño | Tipo | Requerida | Notas |
|---|---|---|---|---|
| `POSTGRES_URL` | chatbot | string | sí | DSN de la DB |
| `META_API_KEY` | chatbot | string | sí* | *requerida solo si se usa el proveedor Meta; acceso lanza error claro |
| `OPENCODE_ZEN_API_KEY` | chatbot | string | no | proveedor Zen |
| `EXASEARCH_API_KEY` | chatbot | string | no | web-search; alias con EXA_API_KEY |
| `EXA_API_KEY` | chatbot | string | no | legado; `EXASEARCH_API_KEY || EXA_API_KEY` (cadena de fallback en tools.ts) |
| `MCP_API_KEY` | chatbot | string | no | auth del mcp-server |
| `AUTH_SECRET` | chatbot | string | no | leída por auth.js vía process.env; las herramientas de eval la fijan |

### Configuración (`secret: false`)
| Variable | Dueño | Tipo | Requerida | Default / detalle |
|---|---|---|---|---|
| `CODING_AGENT_PROJECTS_ROOT` | chatbot/coding-agent | string | sí | raíz de proyectos del worker |
| `CODING_AGENT_SESSIONS_DIR` | chatbot/coding-agent | string | sí | dir de sesiones |
| `CODING_AGENT_ENABLED` | chatbot | boolean | no | `truthy:"true"` (gate de páginas/actions) |
| `CODING_AGENT_WORKER_URL` | chatbot | string | no | default `"http://localhost:3015"` (worker-client) |
| `CODING_AGENT_WORKER_PORT` | chatbot/coding-agent | number | no | `3015` |
| `CODING_AGENT_MODELS_JSON` | coding-agent | string | no | relativo se resuelve contra coding-agent (queda en el consumidor) |
| `CODING_AGENT_AUTH_JSON` | coding-agent | string | no | default worker-owned `.pi/agent/auth.json` |
| `CODING_AGENT_PI_PACKAGES_DIR` | coding-agent | string | no | `.pi/packages/` |
| `CODING_AGENT_AGENT_DIR` | coding-agent | string | no | |
| `DB_PROVIDER` / `DB_DIALECT` | chatbot | string | no | `=== "pglite"` → modo pglite |
| `DEFAULT_CONTEXT_WINDOW` | chatbot | number | no | `128000` |
| `RAG_UPLOAD_LIMIT` | chatbot | string | no | `"false"` deshabilita el límite (semántica especial, no es number) |
| `DEBUG_CHUNKING` | chatbot | boolean | no | `truthy:"true"` |
| `DISABLE_DEV_INDICATOR` | chatbot | boolean | no | `truthy:"1"` (next.config.ts, build-time) |
| `OTEL_ENABLED` | chatbot | boolean | no | `truthy:"1"` |
| `EVAL_BASE_URL` | chatbot | string | no | eval-runner |
| `SERVER_OUTPUT` | chatbot | boolean | no | `truthy` = presencia (playwright) |
| `PORT` | chatbot | number | no | |
| `TRACE_DIR` | tracing | string | no | |
| `TRACE_RUN_ID` | tracing | string | no | |
| `TRACE_ENABLED` | tracing | boolean | no | `truthy:"1"` |
| `TRACE_RAW` | tracing | boolean | no | `truthy:"1"` |
| `NODE_ENV` | string | no | `managed:true` (la provee el framework) |
| `CI` | boolean | no | `managed:true` (la provee el runtime) |

> `NEXT_PUBLIC_ENV` y el resto de `NEXT_PUBLIC_*` quedan **fuera** (restricción 1).

## Accessors semánticos (ejemplo de `config.ts`)

```ts
import { string, secret, int, bool } from "./builders";

export const config = {
  metaApiKey: secret("META_API_KEY"),                    // → () => string (lanza si falta)
  postgresUrl: secret("POSTGRES_URL"),
  exaApiKey: secret("EXASEARCH_API_KEY"),                // el fallback EXA_API_KEY sigue en tools.ts
  workerPort: int("CODING_AGENT_WORKER_PORT", { default: 3015 }),
  tracingEnabled: bool("TRACE_ENABLED", { truthy: "1" }),
  disableDevIndicator: bool("DISABLE_DEV_INDICATOR", { truthy: "1" }),
  contextWindow: int("DEFAULT_CONTEXT_WINDOW", { default: 128000 }),
  codingAgentEnabled: bool("CODING_AGENT_ENABLED", { truthy: "true" }),
  // ...
};
```

Reglas de comportamiento:
- **Lazy:** el valor se lee en cada llamada; nada se lee al importar. Preserva el orden de carga de `dotenv` y permite `vi.stubEnv` en tests.
- **Requerida ausente → throw** `ConfigError` con mensaje claro (nombre de var, descripción, hint). Solo al acceder (no fail-fast al arranque, restricción 2).
- **Opción sin default →** devuelve `string | undefined` (o `number | undefined`).
- **Default presente →** se aplica al no estar definida.
- **Parse inválido (int no numérico) → throw** `ConfigError` claro.
- Un test garantiza que cada key referenciada por un accessor existe en el catálogo y que cada `secret: true` tiene accessor (o está en una lista explícita de excluidas).

## Costura de secretos (restricción 3 — el camino a systemd)

```ts
// src/source.ts
/**
 * ÚNICO módulo que lee variables de entorno.
 *
 * FUTURO (systemd credentials API):
 * Para entradas con secret:true, cuando la unidad defina LoadCredential=...
 * (ej. `LoadCredential=meta_api_key`), systemd expone $CREDENTIALS_DIRECTORY/meta_api_key.
 * Inyección propuesta aquí:
 *   const dir = process.env.CREDENTIALS_DIRECTORY;
 *   if (dir && spec.secret) → leer `${dir}/${name.toLowerCase()}` antes de process.env
 * El catálogo ya discrimina secret vs no-secret para que el cambio sea local a este archivo.
 */
export function readEnv(name: string): string | undefined {
  return process.env[name];
}

export function resolveSecret(name: string): string | undefined {
  return readEnv(name); // punto único por el que pasan todos los secretos
}
```

Los builders de secretos (`secret(key)`) llaman SIEMPRE a `resolveSecret`; los no-secretos a `readEnv`. El test de `source.ts` verifica que `resolveSecret` lee de `process.env` y documenta el punto de inyección futuro. Cuando llegue el momento, el cambio es local a `source.ts` + declarar `LoadCredential=` en el unit file — los consumidores (`config.metaApiKey()`) no cambian.

## Migración de consumidores

Por paquete, reemplazar cada `process.env.X` por el accessor semántico correspondiente:

1. **`tracing`** (4 vars): `TRACE_ENABLED`, `TRACE_DIR`, `TRACE_RAW`, `TRACE_RUN_ID`. Nota: `inspector.ts` y `sink.ts` leen en scope de módulo hoy → pasar a lectura lazy dentro de la función de uso.
2. **`coding-agent`** (7 vars): `CODING_AGENT_*`. Las lecturas en scope de módulo (`models.ts`) pasan a lazy. La resolución relativa de `CODING_AGENT_MODELS_JSON` contra el package **permanece en coding-agent** (el paquete devuelve el string crudo).
3. **`chatbot`** (~25 vars): todo `src/`, `app/`, `scripts/` (eval-runner, seed-test-data), `playwright.config.ts`, `next.config.ts`, `drizzle.config.ts`, `instrumentation.ts`, `mcp-server/`. Excluido: `tests/**` (fijan su entorno deliberadamente y leen `NEXT_PUBLIC_ENV` para seleccionar mocks) y `lib/infrastructure/env.ts` (helpers de `NEXT_PUBLIC_ENV`).

Criterio de salida: `rg "process\.env"` en `src/` de los tres paquetes devuelve 0 hits (excepto tests).

## Testing

- **catalog.test.ts:** keys únicas; tipos válidos; defaults consistentes con el tipo; `secret:true` → acceso vía `resolveSecret`; sin placeholders ni descripciones vacías.
- **config.test.ts:** default aplicado; ausencia de requerida → throw con mensaje; parsing int/bool; int inválido → throw; lectura lazy (cambiar `vi.stubEnv` entre llamadas y observar el cambio).
- **source.test.ts:** `readEnv`/`resolveSecret` devuelven `process.env[name]`; test que documenta (nombre y comentario) el futuro caso `$CREDENTIALS_DIRECTORY`.
- **Integridad accessors↔catálogo:** test que recorre los accessors de `config.ts` y verifica key ∈ catálogo; y que todo secreto del catálogo tiene accessor.
- Los tests existentes de consumidores (que usan `vi.stubEnv`/`process.env.X = ...`) siguen pasando gracias a la lectura lazy.

## Manejo de errores (resumen)

| Situación | Comportamiento |
|---|---|
| Requerida ausente al acceder | `ConfigError` (throw), mensaje con var, descripción y hint |
| Opcional sin default ausente | `undefined` |
| Con default ausente | default |
| Int mal formado | `ConfigError` |
| Key desconocida en builder | error en compile-time (tipado) + test |

## Fuera de alcance (YAGNI)

- Validación fail-fast al arranque (se validará por acceso; se puede añadir un `validate()` explícito después si hace falta)
- Resolución multi-fuente real (solo la costura documentada)
- `NEXT_PUBLIC_*` y el flujo `isTestMode`/`isEvalMode`/`resolveEnvFile`
- Carga de archivos `.env` (sigue en `dotenv-cli` / Next.js)
- Integración con vaults/secret managers
- Migración de `tests/**` (fijan entorno deliberadamente)

## Camino futuro a systemd (documentado, no implementado)

1. Declarar en el unit file: `LoadCredential=meta_api_key` (etc.), systemd expone `$CREDENTIALS_DIRECTORY/meta_api_key`.
2. En `src/source.ts`, para entradas `secret:true`: si `$CREDENTIALS_DIRECTORY` está definida y el archivo existe, leerlo primero; `process.env` como fallback.
3. Cero cambios en consumidores: la API pública (`config.*`) y el catálogo ya discriminan secretos.
