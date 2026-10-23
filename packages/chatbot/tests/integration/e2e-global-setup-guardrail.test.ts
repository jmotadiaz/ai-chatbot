import { describe, expect, it } from "vitest";
import { config } from "config";
import { assertDbMatchesEntorno } from "../../../config/src/guardrails";

/**
 * Guardarraíl del e2e (ticket 05, actualizado en ADR 0011):
 * Bajo ADR 0011, globalSetup() no lee process.env; consume el DSN del bundle
 * estático de Test (env.test.ts), validado por assertDbMatchesEntorno.
 */
describe("e2e globalSetup guardrail", () => {
  it("el bundle de test siempre apunta a la DB de Test (5434/test)", () => {
    expect(config.postgresUrl()).toContain("5434/test");
  });

  it("el guardarraíl rechaza de inmediato un DSN de dev en modo test", () => {
    expect(() =>
      assertDbMatchesEntorno("postgres://postgres:postgres@localhost:5433/dev", "test"),
    ).toThrow(/5434\/test/);
  });

  it("el guardarraíl rechaza de inmediato un DSN de prod en modo test", () => {
    expect(() =>
      assertDbMatchesEntorno("postgres://postgres:postgres@localhost:5435/prod", "test"),
    ).toThrow(/5434\/test/);
  });

  it("el guardarraíl rechaza la DB compartida legendaria", () => {
    expect(() =>
      assertDbMatchesEntorno("postgres://postgres:postgres@localhost:5432/main", "test"),
    ).toThrow(/5434\/test/);
  });
});
