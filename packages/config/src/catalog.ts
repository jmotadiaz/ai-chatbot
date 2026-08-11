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

const catalogDef = {
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

/** EnvVarSpec por clave literal; conserva las claves exactas del catálogo. */
export const ENV_CATALOG: Record<keyof typeof catalogDef, EnvVarSpec> = catalogDef;

export type EnvKey = keyof typeof ENV_CATALOG;

export function getSpec(key: EnvKey): EnvVarSpec {
  return ENV_CATALOG[key];
}
