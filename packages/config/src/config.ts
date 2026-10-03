import {
  bool, intOptional, secret, secretOptional, string, stringOptional,
} from "./builders";
import { assertDbMatchesEntorno } from "./guardrails";

const postgresUrlRaw = secret("POSTGRES_URL");

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
  nextBuildDir: stringOptional("NEXT_BUILD_DIR"),
  allowProdBuild: bool("ALLOW_PROD_BUILD"),

  // --- chatbot: secretos ---
  // Guardarraíl de coherencia (ticket 05): NEXT_PUBLIC_ENV ↔ DSN aislado
  // (test↔5434/test, dev↔5433/dev, prod↔5435/prod) antes de conectar.
  postgresUrl: () => assertDbMatchesEntorno(postgresUrlRaw()),
  gatewayApiKey: secretOptional("AI_GATEWAY_API_KEY"),
  opencodeZenApiKey: secretOptional("OPENCODE_ZEN_API_KEY"),
  openRouterApiKey: secretOptional("OPENROUTER_API_KEY"),
  deepInfraApiKey: secretOptional("DEEPINFRA_API_KEY"),
  openaiApiKey: secretOptional("OPENAI_API_KEY"),
  xaiApiKey: secretOptional("XAI_API_KEY"),
  groqApiKey: secretOptional("GROQ_API_KEY"),
  perplexityApiKey: secretOptional("PERPLEXITY_API_KEY"),
  googleGenerativeAiApiKey: secretOptional("GOOGLE_GENERATIVE_AI_API_KEY"),
  cohereApiKey: secretOptional("COHERE_API_KEY"),
  exaSearchApiKey: secretOptional("EXASEARCH_API_KEY"),
  exaApiKey: secretOptional("EXA_API_KEY"),
  mcpApiKey: secretOptional("MCP_API_KEY"),
  authSecret: secretOptional("AUTH_SECRET"),

  // --- coding-agent ---
  codingAgentModelsJson: stringOptional("CODING_AGENT_MODELS_JSON"),
  codingAgentAgentDir: stringOptional("CODING_AGENT_AGENT_DIR"),
  codingAgentPiPackagesDir: stringOptional("CODING_AGENT_PI_PACKAGES_DIR"),
  codingAgentArtifactsDir: stringOptional("CODING_AGENT_ARTIFACTS_DIR"),
  codingAgentArtifactsUrl: stringOptional("CODING_AGENT_ARTIFACTS_URL"),

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

/**
 * Claves dinámicas que se leen vía readEnv (escape hatch documentado).
 * NEXT_PUBLIC_ENV vive aquí a propósito: las claves NEXT_PUBLIC_* quedan fuera
 * del catálogo tipado (Next las inlinea en build), pero el guardarraíl de
 * coherencia Entorno↔DB lo consume en runtime (ver guardrails.ts).
 */
export const DYNAMIC_ENV_KEYS: string[] = ["NEXT_PUBLIC_ENV"];
