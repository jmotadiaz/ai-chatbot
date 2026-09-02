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
  it("build y build:dev fuerzan el Entorno dev (-o .env.dev) y escriben a .next", () => {
    for (const name of ["build", "build:dev"]) {
      const cmd = s[name];
      expect(cmd, name).toContain("dotenv -o -e ../../.env.dev");
      expect(cmd, name).toContain("migrate.ts");
      expect(cmd, name).toContain("next build");
      // el dotenv debe envolver también a `next build` (NEXT_PUBLIC_* inlineados)
      expect(cmd, name).toMatch(/sh -c '.?dotenv|dotenv -o -e \.\.\/\.\.\/\.env\.dev -- sh -c/);
      expect(cmd, name).not.toContain("NEXT_BUILD_DIR");
    }
  });

  it("build:prod exige el gate ALLOW_PROD_BUILD, fuerza .env.prod y escribe a .next", () => {
    expect(s["build:prod"]).toContain("assert-prod-build-allowed");
    expect(s["build:prod"]).toContain("dotenv -o -e ../../.env.prod");
    expect(s["build:prod"]).toContain("migrate.ts");
    expect(s["build:prod"]).toContain("next build");
    expect(s["build:prod"]).not.toContain("NEXT_BUILD_DIR");
  });

  it("build:prod:verify compila aislado a .next/verify sin requerir el gate", () => {
    const cmd = s["build:prod:verify"];
    expect(cmd).toContain("NEXT_BUILD_DIR=.next/verify");
    expect(cmd).toContain("migrate.ts");
    expect(cmd).toContain("next build");
    expect(cmd).not.toMatch(/ALLOW_PROD_BUILD|assert-prod-build-allowed/);
    // NEXT_BUILD_DIR debe verse tanto en migrate como en next build
    expect(cmd.split("NEXT_BUILD_DIR=.next/verify").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("start:prod es autosuficiente (build:prod + next start -p 8085) y no es la vía canónica", () => {
    expect(s["start:prod"]).toContain("build:prod");
    expect(s["start:prod"]).toContain("next start -p 8085");
  });

  it("migraciones explícitas por Entorno con su .env forzado (-o)", () => {
    for (const env of ["dev", "test", "prod"]) {
      expect(s[`db:${env}:migrate`]).toContain(`dotenv -o -e ../../.env.${env}`);
      expect(s[`db:${env}:migrate`]).toContain("migrate.ts");
    }
  });
});

describe("vía canónica de prod: preview no puede construir en dev", () => {
  for (const [label, cmd] of [
    ["raíz", rootPkg.scripts.preview],
    ["chatbot", s.preview],
  ] as const) {
    it(`${label}: orquesta db:prod:start + build:prod (con gate embebido) + start, todo con .env.prod`, () => {
      expect(cmd).toContain(".env.prod");
      expect(cmd).toMatch(/db:prod:start/);
      expect(cmd).toContain("ALLOW_PROD_BUILD=1");
      expect(cmd).toContain("build:prod");
      // nunca el `build` genérico (ahora es build de dev)
      expect(cmd).not.toMatch(/(run |filter chatbot )build( |$|&&|')/);
    });
  }

  it("ningún script (raíz o chatbot) referencia .env.development.local", () => {
    for (const scripts of [rootPkg.scripts, s]) {
      for (const [name, cmd] of Object.entries(scripts)) {
        expect(cmd, `${name}`).not.toContain(".env.development.local");
      }
    }
  });
});
