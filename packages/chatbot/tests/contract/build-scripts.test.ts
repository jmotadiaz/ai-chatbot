import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrato de scripts de build por Entorno (ADR 0011, tickets 03/04).
 * package.json es la interfaz pública del operador/CI/pm2: con qué `--env`
 * arranca cada pieza, dónde escribe el build y qué camino sirve prod. Parsing
 * del JSON, no texto frágil.
 */
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const chatbotPkg = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };
const rootPkg = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, "../../package.json"), "utf8"),
) as { scripts: Record<string, string> };

const s = chatbotPkg.scripts;

describe("scripts de build del chatbot", () => {
  it("build migra y compila prod por argv (--env=prod); el gate vive en next-cli", () => {
    expect(s.build).toContain("migrate.ts --env=prod");
    expect(s.build).toContain("scripts/next-cli.ts build --env=prod");
    expect(s.build).not.toContain("dotenv");
    expect(s.build).not.toContain("NEXT_BUILD_DIR");
    // `next build` directo (sin launcher) ya no se usa: el Entorno se fija en
    // el mismo proceso y el alias del bundler depende de él.
    expect(s.build).not.toMatch(/(^|&&\s*)next build/);
  });

  it("build:verify compila aislado con --verify, sin requerir el gate", () => {
    const cmd = s["build:verify"];
    expect(cmd).toContain("scripts/next-cli.ts build --env=prod --verify");
    expect(cmd).toContain("migrate.ts --env=prod");
    expect(cmd).not.toMatch(/ALLOW_PROD_BUILD|assert-prod-build-allowed/);
    expect(cmd).not.toContain("dotenv");
  });

  it("build:dev, build:prod, start y start:prod ya no existen (ADR 0006)", () => {
    expect(s["build:dev"]).toBeUndefined();
    expect(s["build:prod"]).toBeUndefined();
    expect(s.start).toBeUndefined();
    expect(s["start:prod"]).toBeUndefined();
  });

  it("chatbot no tiene scripts que invoquen al coding-agent ni mcp-server redundante", () => {
    expect(s["build:worker"]).toBeUndefined();
    expect(s["worker:dev"]).toBeUndefined();
    expect(s["mcp-server"]).toBeUndefined();
    for (const [name, cmd] of Object.entries(s)) {
      expect(cmd, name).not.toContain("coding-agent");
    }
  });

  it("migraciones explícitas por Entorno con --env=<entorno>", () => {
    for (const env of ["dev", "test", "prod"]) {
      expect(s[`db:${env}:migrate`]).toContain(`migrate.ts --env=${env}`);
      expect(s[`db:${env}:migrate`]).not.toContain("dotenv");
    }
  });
});

describe("vía canónica de prod: preview", () => {
  it("raíz: levanta la DB de prod, compila ambos packages con el gate y lanza los preview", () => {
    const cmd = rootPkg.scripts.preview;
    expect(cmd).toContain("--filter chatbot db:prod:start");
    expect(cmd).toContain("ALLOW_PROD_BUILD=1 pnpm --filter chatbot build");
    expect(cmd).toContain("ALLOW_PROD_BUILD=1 pnpm --filter coding-agent build");
    expect(cmd).toContain("pnpm --filter chatbot preview");
    expect(cmd).toContain("pnpm --filter coding-agent preview");
    expect(cmd).not.toContain(".env");
    expect(cmd).not.toContain("dotenv");
  });

  it("raíz: build y build:verify encadenan ambos packages, sin alias db ni start", () => {
    expect(rootPkg.scripts.build).toContain("pnpm --filter chatbot build");
    expect(rootPkg.scripts.build).toContain("pnpm --filter coding-agent build");
    expect(rootPkg.scripts["build:verify"]).toContain("pnpm --filter chatbot build:verify");
    expect(rootPkg.scripts["build:verify"]).toContain("pnpm --filter coding-agent build:verify");
    expect(rootPkg.scripts.start).toBeUndefined();
    expect(rootPkg.scripts["build:worker"]).toBeUndefined();
    expect(rootPkg.scripts["db:migrate"]).toBeUndefined();
  });

  it("chatbot: solo sirve el build de prod con next-cli start --env=prod", () => {
    const cmd = s.preview;
    expect(cmd).toBe("tsx scripts/next-cli.ts start --env=prod --port=8085");
    expect(cmd).not.toContain("coding-agent");
    expect(cmd).not.toContain("db:prod:start");
  });

  it("ningún script (raíz o chatbot) referencia .env.development.local ni dotenv", () => {
    for (const scripts of [rootPkg.scripts, s]) {
      for (const [name, cmd] of Object.entries(scripts)) {
        expect(cmd, `${name}`).not.toContain(".env.development.local");
        expect(cmd, `${name}`).not.toContain("dotenv");
      }
    }
  });
});
