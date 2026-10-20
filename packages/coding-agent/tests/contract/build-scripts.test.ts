import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrato de scripts del worker por Entorno (ticket 07). package.json es la
 * interfaz del operador/CI/pm2: qué compila, dónde escribe y qué puede arrancar
 * el `preview` canónico sin dejar referencias muertas (transport:http).
 */
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../..");
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

describe("scripts del worker (coding-agent)", () => {
  it("dev es la cadena explícita que hoy corre prod (install + tsx http; el catálogo se sincroniza en arranque)", () => {
    expect(s.dev).toContain("tsx scripts/install-packages.ts");
    expect(s.dev).toContain("tsx src/transports/http.ts");
    // El models.json ya no se genera en dev: lo sincroniza el arranque del
    // worker contra el Model Gateway (ensureGatewayModelsJson).
    expect(s.dev).not.toContain("generate-models");
  });

  it("ya no existen start, start:prod, build:prod ni transport:http", () => {
    expect(s.start).toBeUndefined();
    expect(s["start:prod"]).toBeUndefined();
    expect(s["build:prod"]).toBeUndefined();
    expect(s["transport:http"]).toBeUndefined();
  });

  it("build exige el gate y compila a dist/, sin generación estática de modelos", () => {
    const cmd = s.build;
    expect(cmd).toContain("assert-prod-build-allowed");
    expect(cmd).toContain("tsc -p tsconfig.json --outDir dist");
    // El models.json lo sincroniza el arranque del worker contra el Gateway,
    // no el build (el build de prod no necesita el Gateway vivo).
    expect(cmd).not.toContain("generate-models");
    expect(cmd).not.toContain("MODEL_GATEWAY");
    expect(cmd).not.toContain("dist/verify");
  });

  it("build:verify solo compila a dist/verify, sin gate ni generación de modelos", () => {
    const cmd = s["build:verify"];
    expect(cmd).toContain("tsc -p tsconfig.json --outDir dist/verify");
    expect(cmd).not.toMatch(/ALLOW_PROD_BUILD|assert-prod-build-allowed/);
    expect(cmd).not.toContain("generate-models");
    expect(cmd).not.toContain("dotenv");
  });
});

describe("sin referencias muertas a coding-agent transport:http", () => {
  const all = { root: rootPkg.scripts, chatbot: chatbotPkg.scripts, worker: s };
  it("ningún package.json invoca transport:http del worker", () => {
    for (const [pkg, scripts] of Object.entries(all)) {
      for (const [name, cmd] of Object.entries(scripts)) {
        expect(cmd, `${pkg}:${name}`).not.toContain("coding-agent transport:http");
      }
    }
  });

  it("raíz preview delega a chatbot + coding-agent (cada package se ocupa de lo suyo)", () => {
    const cmd = rootPkg.scripts.preview;
    expect(cmd).toContain(".env.prod");
    expect(cmd).toContain("--filter chatbot");
    expect(cmd).toContain("--filter coding-agent");
    expect(cmd).toContain("--parallel");
    expect(cmd).toContain("preview");
  });

  it("chatbot preview orquesta db + build + next start directo (solo lo suyo)", () => {
    const cmd = chatbotPkg.scripts.preview;
    expect(cmd).toContain(".env.prod");
    expect(cmd).toContain("db:prod:start");
    expect(cmd).toContain("ALLOW_PROD_BUILD=1");
    expect(cmd).toContain("pnpm run build");
    expect(cmd).toContain("next start -p 8085");
    expect(cmd).not.toContain("coding-agent");
  });

  it("coding-agent preview arranca el worker compilado (build + node dist) bajo .env.prod", () => {
    const cmd = s.preview;
    expect(cmd).toContain(".env.prod");
    expect(cmd).toContain("ALLOW_PROD_BUILD=1");
    expect(cmd).toContain("pnpm run build");
    expect(cmd).toContain("node --import tsx dist/transports/http.js");
    expect(cmd).not.toContain("start:prod");
    expect(cmd).not.toContain("tsx src/transports/http.ts");
  });
});
