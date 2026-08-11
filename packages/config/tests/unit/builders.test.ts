import { afterEach, describe, expect, it, vi } from "vitest";
import { string, stringOptional, secret, secretOptional, int, intOptional, bool } from "../../src/builders";
import { ConfigError } from "../../src/errors";

afterEach(() => vi.unstubAllEnvs());

describe("builders", () => {
  describe("string", () => {
    it("lanza ConfigError cuando falta una requerida", () => {
      expect(() => string("CODING_AGENT_PROJECTS_ROOT")()).toThrow(ConfigError);
      expect(() => string("CODING_AGENT_PROJECTS_ROOT")()).toThrow(/CODING_AGENT_PROJECTS_ROOT/);
    });

    it("aplica el default del catálogo", () => {
      expect(stringOptional("CODING_AGENT_WORKER_URL")()).toBe("http://localhost:3015");
    });

    it("stringOptional devuelve undefined sin default ni valor", () => {
      vi.unstubAllEnvs();
      expect(stringOptional("EVAL_BASE_URL")()).toBeUndefined();
    });
  });

  describe("secret", () => {
    it("lee via resolveSecret y lanza si falta", () => {
      vi.stubEnv("POSTGRES_URL", "postgres://u:p@localhost:5432/db");
      expect(secret("POSTGRES_URL")()).toBe("postgres://u:p@localhost:5432/db");
      expect(() => secret("POSTGRES_URL")()).not.toThrow();
      vi.unstubAllEnvs();
      expect(() => secret("POSTGRES_URL")()).toThrow(ConfigError);
    });

    it("secretOptional devuelve undefined si falta", () => {
      expect(secretOptional("META_API_KEY")()).toBeUndefined();
    });
  });

  describe("int", () => {
    it("parsea y aplica el default del catálogo", () => {
      expect(int("CODING_AGENT_WORKER_PORT")()).toBe(3015);
      vi.stubEnv("CODING_AGENT_WORKER_PORT", "4000");
      expect(int("CODING_AGENT_WORKER_PORT")()).toBe(4000);
    });

    it("lanza ConfigError si el valor no es un entero", () => {
      vi.stubEnv("CODING_AGENT_WORKER_PORT", "abc");
      expect(() => int("CODING_AGENT_WORKER_PORT")()).toThrow(ConfigError);
    });

    it("intOptional devuelve undefined sin default ni valor", () => {
      expect(intOptional("PORT")()).toBeUndefined();
      vi.stubEnv("PORT", "3100");
      expect(intOptional("PORT")()).toBe(3100);
    });
  });

  describe("bool", () => {
    it("compara con truthy exacto", () => {
      vi.stubEnv("TRACE_ENABLED", "1");
      expect(bool("TRACE_ENABLED")()).toBe(true);
      vi.stubEnv("TRACE_ENABLED", "true");
      expect(bool("TRACE_ENABLED")()).toBe(false); // truthy de TRACE_ENABLED es "1"
      vi.stubEnv("CODING_AGENT_ENABLED", "true");
      expect(bool("CODING_AGENT_ENABLED")()).toBe(true); // truthy es "true"
    });

    it("sin truthy es presencia (raw !== '')", () => {
      vi.stubEnv("CI", "1");
      expect(bool("CI")()).toBe(true);
      vi.stubEnv("CI", "");
      expect(bool("CI")()).toBe(false);
    });

    it("ausente sin default → false", () => {
      expect(bool("DEBUG_CHUNKING")()).toBe(false);
    });
  });
});
