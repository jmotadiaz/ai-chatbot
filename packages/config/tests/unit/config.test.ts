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
