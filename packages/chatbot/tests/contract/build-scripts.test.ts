import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrato de scripts de build por Entorno (ticket 06). package.json es la
 * interfaz pública del operador/CI/pm2: quién fuerza qué .env, dónde escribe
 * el build, y qué camino arranca prod. Parsing del JSON, no texto frágil.
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
  it("build exige el gate ALLOW_PROD_BUILD, fuerza .env.prod y escribe a .next", () => {
    expect(s.build).toContain("assert-prod-build-allowed");
    expect(s.build).toContain("dotenv -o -e ../../.env.prod");
    expect(s.build).toContain("migrate.ts");
    expect(s.build).toContain("next build");
    expect(s.build).not.toContain("NEXT_BUILD_DIR");
  });

  it("build:verify compila aislado a .next/verify sin requerir el gate", () => {
    const cmd = s["build:verify"];
    expect(cmd).toContain("NEXT_BUILD_DIR=.next/verify");
    expect(cmd).toContain("migrate.ts");
    expect(cmd).toContain("next build");
    expect(cmd).not.toMatch(/ALLOW_PROD_BUILD|assert-prod-build-allowed/);
    // NEXT_BUILD_DIR debe verse tanto en migrate como en next build
    expect(cmd.split("NEXT_BUILD_DIR=.next/verify").length - 1).toBeGreaterThanOrEqual(2);
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

  it("migraciones explícitas por Entorno con su .env forzado (-o)", () => {
    for (const env of ["dev", "test", "prod"]) {
      expect(s[`db:${env}:migrate`]).toContain(`dotenv -o -e ../../.env.${env}`);
      expect(s[`db:${env}:migrate`]).toContain("migrate.ts");
    }
  });
});

describe("vía canónica de prod: preview", () => {
  it("raíz: delega a chatbot + coding-agent preview con .env.prod (cada package lo suyo)", () => {
    const cmd = rootPkg.scripts.preview;
    expect(cmd).toContain(".env.prod");
    expect(cmd).toContain("--filter chatbot");
    expect(cmd).toContain("--filter coding-agent");
    expect(cmd).toContain("--parallel");
    expect(cmd).toContain("preview");
    // la composición real vive en cada package, no duplicada en raíz
    expect(cmd).not.toMatch(/db:prod:start/);
  });

  it("raíz: build y build:verify ejecutan en paralelo ambos packages, sin start ni alias db", () => {
    expect(rootPkg.scripts.build).toContain("--parallel build");
    expect(rootPkg.scripts["build:verify"]).toContain("--parallel build:verify");
    expect(rootPkg.scripts.start).toBeUndefined();
    expect(rootPkg.scripts["build:worker"]).toBeUndefined();
    expect(rootPkg.scripts["db:migrate"]).toBeUndefined();
  });

  it("chatbot: orquesta db:prod:start + build (con gate) + next start, solo lo suyo", () => {
    const cmd = s.preview;
    expect(cmd).toContain(".env.prod");
    expect(cmd).toMatch(/db:prod:start/);
    expect(cmd).toContain("ALLOW_PROD_BUILD=1");
    expect(cmd).toContain("pnpm run build");
    expect(cmd).toContain("next start -p 8085");
    expect(cmd).not.toContain("coding-agent");
  });

  it("ningún script (raíz o chatbot) referencia .env.development.local", () => {
    for (const scripts of [rootPkg.scripts, s]) {
      for (const [name, cmd] of Object.entries(scripts)) {
        expect(cmd, `${name}`).not.toContain(".env.development.local");
      }
    }
  });
});
