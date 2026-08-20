import { describe, it, expect } from "vitest";
import { ENV_CATALOG } from "../../src/catalog";

describe("ENV_CATALOG", () => {
  it("declara todas las variables verificadas del monorepo (fuente única)", () => {
    const expectedKeys = [
      // chatbot — secretos
      "POSTGRES_URL", "AI_GATEWAY_API_KEY", "OPENCODE_ZEN_API_KEY", "DEEPINFRA_API_KEY",
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
