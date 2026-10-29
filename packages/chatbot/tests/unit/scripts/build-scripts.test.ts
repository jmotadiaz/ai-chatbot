import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract of the per-Environment build scripts (ADR 0011, tickets 03/04).
 * package.json is the public interface of the operator/CI/pm2: with which `--env`
 * each piece starts, where the build writes and which path serves prod. JSON
 * parsing, not fragile text.
 */
const PACKAGE_ROOT = path.resolve(__dirname, "../../..");
const chatbotPkg = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };
const rootPkg = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, "../../package.json"), "utf8"),
) as { scripts: Record<string, string> };

const s = chatbotPkg.scripts;

describe("chatbot build scripts", () => {
  it("build protects the DB with a prior gate, migrates and compiles prod by argv (--env=prod)", () => {
    expect(s.build).toContain("scripts/assert-prod-build-allowed.ts");
    expect(s.build).toContain("migrate.ts --env=prod");
    expect(s.build).toContain("scripts/next-cli.ts build --env=prod");
    // The assert-prod-build-allowed gate must precede migrate.ts to protect the DB
    const gateIndex = s.build.indexOf("scripts/assert-prod-build-allowed.ts");
    const migrateIndex = s.build.indexOf("migrate.ts --env=prod");
    expect(gateIndex).toBeLessThan(migrateIndex);
    expect(s.build).not.toContain("dotenv");
    expect(s.build).not.toContain("NEXT_BUILD_DIR");
    // A direct `next build` (without the launcher) is no longer used: the
    // Environment is set in the same process and the bundler alias depends on it.
    expect(s.build).not.toMatch(/(^|&&\s*)next build/);
  });

  it("build:verify compiles in isolation with --verify, without migrating prod's live DB", () => {
    const cmd = s["build:verify"];
    expect(cmd).toContain("scripts/next-cli.ts build --env=prod --verify");
    // build:verify must be strictly isolated from the DB (AGENTS.md / hard guard)
    expect(cmd).not.toContain("migrate.ts");
    expect(cmd).not.toMatch(/ALLOW_PROD_BUILD|assert-prod-build-allowed/);
    expect(cmd).not.toContain("dotenv");
  });

  it("explicit per-Environment migrations with --env=<environment>", () => {
    for (const env of ["dev", "test", "prod"]) {
      expect(s[`db:${env}:migrate`]).toContain(`migrate.ts --env=${env}`);
      expect(s[`db:${env}:migrate`]).not.toContain("dotenv");
    }
  });
});

describe("canonical prod path: preview", () => {
  it("root: brings up the prod DB, compiles both packages with the gate and launches the previews", () => {
    const cmd = rootPkg.scripts.preview;
    expect(cmd).toContain("--filter chatbot db:prod:start");
    expect(cmd).toContain("pnpm --filter chatbot build --allow-prod-build");
    expect(cmd).toContain("pnpm --filter coding-agent build --allow-prod-build");
    expect(cmd).toContain("pnpm --filter chatbot preview");
    expect(cmd).toContain("pnpm --filter coding-agent preview");
    expect(cmd).not.toContain(".env");
    expect(cmd).not.toContain("dotenv");
  });

  it("root: build and build:verify chain both packages and no unscoped db:migrate", () => {
    expect(rootPkg.scripts.build).toContain("pnpm --filter chatbot build");
    expect(rootPkg.scripts.build).toContain("pnpm --filter coding-agent build");
    expect(rootPkg.scripts["build:verify"]).toContain("pnpm --filter chatbot build:verify");
    expect(rootPkg.scripts["build:verify"]).toContain("pnpm --filter coding-agent build:verify");
    expect(rootPkg.scripts["db:migrate"]).toBeUndefined();
  });

  it("chatbot: only serves the prod build with next-cli start --env=prod", () => {
    const cmd = s.preview;
    expect(cmd).toBe("tsx scripts/next-cli.ts start --env=prod --port=8085");
    expect(cmd).not.toContain("db:prod:start");
  });

  it("no script (root or chatbot) references .env.development.local or dotenv", () => {
    for (const scripts of [rootPkg.scripts, s]) {
      for (const [name, cmd] of Object.entries(scripts)) {
        expect(cmd, `${name}`).not.toContain(".env.development.local");
        expect(cmd, `${name}`).not.toContain("dotenv");
      }
    }
  });
});
