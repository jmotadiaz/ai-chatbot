import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Contrato (ticket 06): el distDir de Next es parametrizable vía
 * NEXT_BUILD_DIR para que `build:prod:verify` escriba a `.next/verify`
 * sin pisar el `.next` que sirve prod bajo pm2.
 */
async function loadNextConfig() {
  vi.resetModules();
  const mod = await import("@/next.config");
  return (mod as { default: { distDir?: string } }).default;
}

describe("next.config distDir aislable", () => {
  const saved = process.env.NEXT_BUILD_DIR;
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_BUILD_DIR;
    else process.env.NEXT_BUILD_DIR = saved;
  });

  it("sin NEXT_BUILD_DIR construye en .next (default canónico)", async () => {
    delete process.env.NEXT_BUILD_DIR;
    expect((await loadNextConfig()).distDir).toBe(".next");
  });

  it("con NEXT_BUILD_DIR=.next/verify construye en el directorio aislado", async () => {
    process.env.NEXT_BUILD_DIR = ".next/verify";
    expect((await loadNextConfig()).distDir).toBe(".next/verify");
  });
});
