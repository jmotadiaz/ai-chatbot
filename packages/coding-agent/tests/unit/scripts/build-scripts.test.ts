import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Per-Environment scripts contract (tickets 07 and 04 of ADR 0011). package.json
 * is the operator/CI/pm2 interface: what it compiles, where it writes, with which
 * `--env` it starts and what the canonical `preview` may launch without dead
 * references or `.env.*` files.
 */
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../..");
const workerPkg = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };
const rootPkg = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, "../../package.json"), "utf8"),
) as { scripts: Record<string, string> };
const chatbotPkg = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, "../chatbot/package.json"), "utf8"),
) as { scripts: Record<string, string> };

const s = workerPkg.scripts;

describe("worker scripts (coding-agent)", () => {
  it("dev boots install + tsx watch with --env=dev; the catalog syncs on startup", () => {
    expect(s.dev).toContain("tsx scripts/install-packages.ts --env=dev");
    expect(s.dev).toContain("tsx watch src/transports/http.ts --env=dev");
  });

  it("build requires the gate and compiles prod to dist/", () => {
    const cmd = s.build;
    expect(cmd).toContain("assert-prod-build-allowed");
    expect(cmd).toContain("tsc -p tsconfig.json --outDir dist");
    expect(cmd).not.toContain("dist/verify");
  });

  it("build:verify only compiles to dist/verify, without the gate", () => {
    const cmd = s["build:verify"];
    expect(cmd).toContain("tsc -p tsconfig.json --outDir dist/verify");
    expect(cmd).not.toMatch(/ALLOW_PROD_BUILD|assert-prod-build-allowed/);
    expect(cmd).not.toContain("dotenv");
  });
});

describe("monorepo scripts without dotenv or .env.* files (ADR 0011)", () => {
  const all = { root: rootPkg.scripts, chatbot: chatbotPkg.scripts, worker: s };

  it("no script invokes dotenv or loads .env.{dev,prod,test}", () => {
    for (const [pkg, scripts] of Object.entries(all)) {
      for (const [name, cmd] of Object.entries(scripts)) {
        expect(cmd, `${pkg}:${name}`).not.toContain("dotenv");
        expect(cmd, `${pkg}:${name}`).not.toMatch(/\.env\.(dev|prod|test|development)/);
      }
    }
  });

  it("scripts that pick an Environment do it with --env=prod|dev|test", () => {
    expect(chatbotPkg.scripts.dev).toContain("next-cli.ts dev --env=dev");
    expect(chatbotPkg.scripts.build).toContain("next-cli.ts build --env=prod");
    expect(chatbotPkg.scripts["build:verify"]).toContain("--verify");
    expect(chatbotPkg.scripts["db:dev:migrate"]).toContain("--env=dev");
    expect(chatbotPkg.scripts["db:test:migrate"]).toContain("--env=test");
    expect(chatbotPkg.scripts["db:prod:migrate"]).toContain("--env=prod");
    expect(chatbotPkg.scripts["db:seed:dev"]).toContain("--env=dev");
    expect(chatbotPkg.scripts["db:seed:test"]).toContain("--env=test");
    expect(chatbotPkg.scripts["mcp:start"]).toContain("--env=dev");
    expect(s.dev).toContain("--env=dev");
    expect(s.preview).toContain("--env=prod");
    expect(s["packages:install"]).toContain("--env=dev");
  });
});

describe("prod preview path (gate and compiled artifacts)", () => {
  it("root preview compiles both packages with the gate and starts the previews", () => {
    const cmd = rootPkg.scripts.preview;
    expect(cmd).toContain("db:prod:start");
    expect(cmd).toContain("--allow-prod-build");
    expect(cmd).toContain("--filter chatbot build");
    expect(cmd).toContain("--filter coding-agent build");
    expect(cmd).toContain("concurrently");
    expect(cmd).toContain("pnpm --filter chatbot preview");
    expect(cmd).toContain("pnpm --filter coding-agent preview");
  });

  it("chatbot preview only starts the compiled server (next-cli start --env=prod)", () => {
    const cmd = chatbotPkg.scripts.preview;
    expect(cmd).toContain("next-cli.ts start --env=prod --port=8085");
    expect(cmd).not.toContain("db:prod:start");
    expect(cmd).not.toContain("next start");
  });

  it("coding-agent preview starts the compiled worker under --env=prod", () => {
    const cmd = s.preview;
    expect(cmd).toContain("--allow-prod-build");
    expect(cmd).toContain("pnpm run build");
    expect(cmd).toContain("node --import tsx dist/transports/http.js --env=prod");
    expect(cmd).not.toContain("tsx src/transports/http.ts");
  });
});
