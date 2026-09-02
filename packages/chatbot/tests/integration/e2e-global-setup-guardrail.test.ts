import { afterEach, describe, expect, it } from "vitest";
import globalSetup from "../e2e/global-setup";

/**
 * Guardarraíl del e2e (ticket 05): Playwright carga .env.test con override,
 * pero si alguien ejecuta globalSetup con un POSTGRES_URL arrastrado de otro
 * Entorno (p. ej. el shell exportado), debe fallar antes de tocar ninguna DB —
 * sin conexiones, sin esperas.
 */
describe("e2e globalSetup guardrail", () => {
  const saved = process.env.POSTGRES_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = saved;
  });

  it("rechaza de inmediato un POSTGRES_URL de dev", async () => {
    process.env.POSTGRES_URL = "postgres://postgres:postgres@localhost:5433/dev";
    await expect(globalSetup()).rejects.toThrow(/5434\/test/);
  });

  it("rechaza de inmediato un POSTGRES_URL de prod", async () => {
    process.env.POSTGRES_URL = "postgres://postgres:postgres@localhost:5435/prod";
    await expect(globalSetup()).rejects.toThrow(/5434\/test/);
  });

  it("rechaza la DB compartida legendaria", async () => {
    process.env.POSTGRES_URL = "postgres://postgres:postgres@localhost:5432/main";
    await expect(globalSetup()).rejects.toThrow(/5434\/test/);
  });
});
