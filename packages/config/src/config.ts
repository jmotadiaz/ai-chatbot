import {
  bool, intOptional, secret, secretOptional, string, stringOptional,
} from "./builders";
import type { EnvKey } from "./catalog";

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
  codingAgentWorkerPort: intOptional("CODING_AGENT_WORKER_PORT"),
  codingAgentAuthJson: stringOptional("CODING_AGENT_AUTH_JSON"),
  dbProvider: stringOptional("DB_PROVIDER"),
  dbDialect: stringOptional("DB_DIALECT"),
  contextWindow: intOptional("DEFAULT_CONTEXT_WINDOW"),
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
  gatewayApiKey: secretOptional("AI_GATEWAY_API_KEY"),
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

/** Claves dinámicas que se leen vía readEnv (escape hatch documentado). */
export const DYNAMIC_ENV_KEYS: EnvKey[] = ["CODING_AGENT_SUPERPOWERS_REF"];
