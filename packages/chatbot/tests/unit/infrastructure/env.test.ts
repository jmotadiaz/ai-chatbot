import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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
    it("returns .env.test in test mode", async () => {
      process.env.NEXT_PUBLIC_ENV = "test";
      const { resolveEnvFile } = await import("@/lib/infrastructure/env");
      expect(resolveEnvFile()).toBe(".env.test");
    });

    it("returns .env.evals in eval mode", async () => {
      process.env.NEXT_PUBLIC_ENV = "evals";
      const { resolveEnvFile } = await import("@/lib/infrastructure/env");
      expect(resolveEnvFile()).toBe(".env.evals");
    });

    it("returns .env.development.local by default", async () => {
      const { resolveEnvFile } = await import("@/lib/infrastructure/env");
      expect(resolveEnvFile()).toBe(".env.development.local");
    });

    it("returns .env.development.local for any other value", async () => {
      process.env.NEXT_PUBLIC_ENV = "production";
      const { resolveEnvFile } = await import("@/lib/infrastructure/env");
      expect(resolveEnvFile()).toBe(".env.development.local");
    });
  });
});
