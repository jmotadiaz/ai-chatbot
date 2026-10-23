import { describe, expect, it } from "vitest";
import { config } from "config";
import { assertDatabaseMatchesEnvironment } from "../../../config/src/guardrails";

/**
 * e2e guardrail (ticket 05, updated in ADR 0011):
 * Under ADR 0011, globalSetup() does not read process.env; it consumes the DSN
 * from the static Test bundle (env.test.ts), validated by
 * assertDatabaseMatchesEnvironment.
 */
describe("e2e globalSetup guardrail", () => {
  it("the test bundle always points to the Test DB (5434/test)", () => {
    expect(config.postgresUrl()).toContain("5434/test");
  });

  it("the guardrail immediately rejects a dev DSN in test mode", () => {
    expect(() =>
      assertDatabaseMatchesEnvironment("postgres://postgres:postgres@localhost:5433/dev", "test"),
    ).toThrow(/5434\/test/);
  });

  it("the guardrail immediately rejects a prod DSN in test mode", () => {
    expect(() =>
      assertDatabaseMatchesEnvironment("postgres://postgres:postgres@localhost:5435/prod", "test"),
    ).toThrow(/5434\/test/);
  });

  it("the guardrail rejects the legendary shared DB", () => {
    expect(() =>
      assertDatabaseMatchesEnvironment("postgres://postgres:postgres@localhost:5432/main", "test"),
    ).toThrow(/5434\/test/);
  });
});
