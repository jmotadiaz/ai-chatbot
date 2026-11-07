import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBuildFlags, resetBuildFlagsForTests, setBuildFlags } from "../../src/facade";
import { composePostgresUrl } from "../../src/guardrails";
import { resetSecretsForTests, resolveDotenvSecrets } from "../../src/dotenv";

describe("composePostgresUrl", () => {
  it("composes standard coordinates and credentials into a valid Postgres DSN", () => {
    const url = composePostgresUrl({
      user: "myuser",
      password: "mypassword",
      host: "localhost",
      port: 5433,
      database: "dev",
    });
    expect(url).toBe("postgres://myuser:mypassword@localhost:5433/dev");
  });

  it("escapes special characters in username and password", () => {
    const url = composePostgresUrl({
      user: "user@domain.com",
      password: "p@ssword:with/special#chars",
      host: "127.0.0.1",
      port: 5434,
      database: "test",
    });
    expect(url).toBe(
      "postgres://user%40domain.com:p%40ssword%3Awith%2Fspecial%23chars@127.0.0.1:5434/test",
    );
  });
});

describe("resolveDotenvSecrets", () => {
  let origUser: string | undefined;
  let origPassword: string | undefined;

  beforeEach(() => {
    origUser = process.env.POSTGRES_USER;
    origPassword = process.env.POSTGRES_PASSWORD;
    delete process.env.POSTGRES_USER;
    delete process.env.POSTGRES_PASSWORD;
    resetSecretsForTests();
    resetBuildFlagsForTests();
  });

  afterEach(() => {
    if (origUser !== undefined) process.env.POSTGRES_USER = origUser;
    else delete process.env.POSTGRES_USER;
    if (origPassword !== undefined) process.env.POSTGRES_PASSWORD = origPassword;
    else delete process.env.POSTGRES_PASSWORD;
    resetSecretsForTests();
    resetBuildFlagsForTests();
  });

  it("reads required secrets from existing .env into memory without polluting process.env", () => {
    const secrets = resolveDotenvSecrets("dev");
    expect(secrets.postgresUser).toBe("postgres");
    expect(secrets.postgresPassword).toBe("postgres");
    expect(secrets.modelGatewayApiKey).toBeDefined();
    expect(secrets.authSecret).toBeDefined();
    expect(secrets.exaApiKey).toBeDefined();
    expect(secrets.context7ApiKey).toBeDefined();

    // Verify process.env was NEVER mutated (ADR 0014)
    expect(process.env.POSTGRES_USER).toBeUndefined();
    expect(process.env.POSTGRES_PASSWORD).toBeUndefined();
  });

  it("returns verify placeholders when in verifyBuild mode even if .env keys are missing", () => {
    setBuildFlags({ verifyBuild: true });
    expect(getBuildFlags().verifyBuild).toBe(true);

    const secrets = resolveDotenvSecrets("prod");
    expect(secrets.postgresUser).toBeDefined();
    expect(secrets.postgresPassword).toBeDefined();
    expect(secrets.authSecret).toBeDefined();
  });
});
