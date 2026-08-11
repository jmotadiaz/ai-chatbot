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
