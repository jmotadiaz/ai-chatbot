import { afterEach, describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { ENV_CATALOG } from "../../src/catalog";

/**
 * NEXT_BUILD_DIR (ticket 06): parametriza el distDir de Next para que la
 * verificación del agente escriba a `.next/verify` y nunca pise el `.next`
 * que sirve prod. Sin la variable, el default canónico de Next (`.next`).
 */
describe("config.nextBuildDir", () => {
  const saved = process.env.NEXT_BUILD_DIR;
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_BUILD_DIR;
    else process.env.NEXT_BUILD_DIR = saved;
  });

  it("default .next cuando la variable no está definida", () => {
    delete process.env.NEXT_BUILD_DIR;
    expect(config.nextBuildDir()).toBe(".next");
  });

  it("refleja el override (aislamiento de verificación)", () => {
    process.env.NEXT_BUILD_DIR = ".next/verify";
    expect(config.nextBuildDir()).toBe(".next/verify");
  });

  it("es opcional, string, y vive en el catálogo", () => {
    const spec = ENV_CATALOG.NEXT_BUILD_DIR;
    expect(spec.type).toBe("string");
    expect(spec.required).toBe(false);
    expect(spec.secret).toBe(false);
  });
});
