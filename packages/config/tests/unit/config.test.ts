import { beforeEach, describe, expect, it, vi } from "vitest";
import { config, optional, DYNAMIC_ENV_KEYS } from "../../src/config";
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
    const dynamic = new Set(DYNAMIC_ENV_KEYS);

    for (const key of catalogKeys) {
      if (dynamic.has(key)) continue;
      const kind = byKey.get(key);
      expect(kind, `sin accessor para ${key}`).toBeDefined();
      const spec = ENV_CATALOG[key];
      if (spec.secret) {
        expect(["secret", "secretOptional"], key).toContain(kind);
      } else {
        expect(["secret", "secretOptional"], key).not.toContain(kind);
      }
      if (spec.required) {
        expect(["string", "secret", "int"], key).toContain(kind);
      } else {
        expect(["string", "secret", "int"], key).not.toContain(kind);
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

  it("postgresUrl() aplica el guardarraíl NEXT_PUBLIC_ENV ↔ DSN (ticket 05)", () => {
    // Sin Entorno declarado el DSN pasa tal cual (runners sin dotenv).
    mockReadEnv.mockReturnValue(undefined);
    mockResolveSecret.mockReturnValue(
      "postgres://postgres:postgres@127.0.0.1:5432/main",
    );
    expect(config.postgresUrl()).toBe(
      "postgres://postgres:postgres@127.0.0.1:5432/main",
    );

    // Con Entorno declarado, solo vale el DSN de su DB aislada.
    mockReadEnv.mockImplementation((name) =>
      name === "NEXT_PUBLIC_ENV" ? "test" : undefined,
    );
    expect(() => config.postgresUrl()).toThrow(ConfigError);
    expect(() => config.postgresUrl()).toThrow(/5434\/test/);

    mockResolveSecret.mockReturnValue(
      "postgres://postgres:postgres@127.0.0.1:5434/test",
    );
    expect(config.postgresUrl()).toBe(
      "postgres://postgres:postgres@127.0.0.1:5434/test",
    );
  });
});
