import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Los ficheros de entorno viven en la raíz del repo; la resolución devuelve
 * rutas absolutas ancladas al repo (no al cwd) para que migrator, seeds,
 * drizzle y playwright funcionen desde cualquier directorio.
 *
 * Cinco niveles desde tests/unit/infrastructure (tests, unit, infrastructure,
 * chatbot, packages) = raíz real; el caso de `.env.test` (versionado) además
 * verifica que el fichero resuelto EXISTE, para que el anclaje no pueda
 * romperse otra vez de forma tautológica (el bug original apuntaba a
 * packages/ y dotenv lo ignoraba en silencio — lo enmascaraba el `dotenv -o`
 * de los scripts). `.env.dev`/`.env.prod` no se comprueban: son gitignored y
 * en CI no existen.
 */
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

describe("env helpers", () => {
  const originalEnv = process.env.NEXT_PUBLIC_ENV;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ENV;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_ENV;
    } else {
      process.env.NEXT_PUBLIC_ENV = originalEnv;
    }
    vi.resetModules();
  });

  describe("isTestMode", () => {
    it("is false when NEXT_PUBLIC_ENV is not set", async () => {
      const { isTestMode } = await import("@/lib/infrastructure/env");
      expect(isTestMode()).toBe(false);
    });

    it("is true when NEXT_PUBLIC_ENV is 'test'", async () => {
      process.env.NEXT_PUBLIC_ENV = "test";
      const { isTestMode } = await import("@/lib/infrastructure/env");
      expect(isTestMode()).toBe(true);
    });

    it("is false when NEXT_PUBLIC_ENV is 'evals'", async () => {
      process.env.NEXT_PUBLIC_ENV = "evals";
      const { isTestMode } = await import("@/lib/infrastructure/env");
      expect(isTestMode()).toBe(false);
    });
  });

  describe("isEvalMode", () => {
    it("is false when NEXT_PUBLIC_ENV is not set", async () => {
      const { isEvalMode } = await import("@/lib/infrastructure/env");
      expect(isEvalMode()).toBe(false);
    });

    it("is true when NEXT_PUBLIC_ENV is 'evals'", async () => {
      process.env.NEXT_PUBLIC_ENV = "evals";
      const { isEvalMode } = await import("@/lib/infrastructure/env");
      expect(isEvalMode()).toBe(true);
    });

    it("is false when NEXT_PUBLIC_ENV is 'test'", async () => {
      process.env.NEXT_PUBLIC_ENV = "test";
      const { isEvalMode } = await import("@/lib/infrastructure/env");
      expect(isEvalMode()).toBe(false);
    });
  });

  describe("resolveEnvFile", () => {
    it("returns the repo-root .env.test in test mode", async () => {
      process.env.NEXT_PUBLIC_ENV = "test";
      const { resolveEnvFile } = await import("@/lib/infrastructure/env-file");
      expect(resolveEnvFile()).toBe(path.join(repoRoot, ".env.test"));
      expect(existsSync(resolveEnvFile()), resolveEnvFile()).toBe(true);
    });

    it("returns the repo-root .env.evals in eval mode", async () => {
      process.env.NEXT_PUBLIC_ENV = "evals";
      const { resolveEnvFile } = await import("@/lib/infrastructure/env-file");
      expect(resolveEnvFile()).toBe(path.join(repoRoot, ".env.evals"));
    });

    it("returns the repo-root .env.dev in dev mode", async () => {
      process.env.NEXT_PUBLIC_ENV = "dev";
      const { resolveEnvFile } = await import("@/lib/infrastructure/env-file");
      expect(resolveEnvFile()).toBe(path.join(repoRoot, ".env.dev"));
    });

    it("returns the repo-root .env.prod in prod mode", async () => {
      process.env.NEXT_PUBLIC_ENV = "prod";
      const { resolveEnvFile } = await import("@/lib/infrastructure/env-file");
      expect(resolveEnvFile()).toBe(path.join(repoRoot, ".env.prod"));
    });

    it("defaults to .env.dev when NEXT_PUBLIC_ENV is not set", async () => {
      const { resolveEnvFile } = await import("@/lib/infrastructure/env-file");
      expect(resolveEnvFile()).toBe(path.join(repoRoot, ".env.dev"));
    });

    it("defaults to .env.dev for any unknown value", async () => {
      process.env.NEXT_PUBLIC_ENV = "production";
      const { resolveEnvFile } = await import("@/lib/infrastructure/env-file");
      expect(resolveEnvFile()).toBe(path.join(repoRoot, ".env.dev"));
    });

    it("never resolves to .env.development.local", async () => {
      process.env.NEXT_PUBLIC_ENV = "test";
      const { resolveEnvFile } = await import("@/lib/infrastructure/env-file");
      expect(resolveEnvFile()).not.toContain(".env.development.local");
    });
  });
});