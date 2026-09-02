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
  it("dev es la cadena explícita que hoy corre prod (install + models + tsx http)", () => {
    expect(s.dev).toContain("tsx scripts/install-packages.ts");
    expect(s.dev).toContain("tsx scripts/generate-models.ts");
    expect(s.dev).toContain("tsx src/transports/http.ts");
  });

  it("ya no existen start (alias) ni transport:http", () => {
    expect(s.start).toBeUndefined();
    expect(s["transport:http"]).toBeUndefined();
  });

  it("build:prod exige el gate, compila a dist/ y genera models.json con .env.prod", () => {
    const cmd = s["build:prod"];
    expect(cmd).toContain("assert-prod-build-allowed");
    expect(cmd).toContain("tsc -p tsconfig.json --outDir dist");
    expect(cmd).toContain("dotenv -o -e ../../.env.prod");
    expect(cmd).toContain("generate-models");
    expect(cmd).not.toContain("dist/verify");
  });

  it("build:prod:verify compila a dist/verify y modela en .pi-verify, sin gate ni escrituras de prod", () => {
    const cmd = s["build:prod:verify"];
    expect(cmd).toContain("tsc -p tsconfig.json --outDir dist/verify");
    expect(cmd).toContain("CODING_AGENT_MODELS_JSON=.pi-verify/models.json");
    expect(cmd).toContain("generate-models");
    expect(cmd).not.toMatch(/ALLOW_PROD_BUILD|assert-prod-build-allowed/);
    // nada de .env.prod con -o: verificar no puede reescribir .pi-prod/models.json
    expect(cmd).not.toContain("dotenv");
  });

  it("start:prod es autosuficiente (build:prod + node del bundle) — evolución futura, no vía canónica", () => {
    expect(s["start:prod"]).toContain("build:prod");
    // Desviación documentada del literal del spec (`node dist/transports/http.js`):
    // Node ESM puro no resuelve imports sin extensión — ni del propio dist (tsc
    // los emite como en src) ni de los paquetes workspace de fuentes TS (config,
    // tracing, models). `--import tsx` registra el resolutor sin wrapper binario
    // ni proceso doble y mantiene node como runtime. Probado en vivo en 3999.
    expect(s["start:prod"]).toMatch(/node --import tsx dist\/transports\/http\.js/);
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
  it("chatbot preview orquesta db + build:prod + next start (solo lo suyo)", () => {
    const cmd = chatbotPkg.scripts.preview;
    expect(cmd).toContain(".env.prod");
    expect(cmd).toContain("db:prod:start");
    expect(cmd).toContain("ALLOW_PROD_BUILD=1");
    expect(cmd).toContain("build:prod");
    expect(cmd).toContain("npm run start");
    expect(cmd).not.toContain("coding-agent");
  });
  it("coding-agent preview arranca el worker compilado (build:prod + node dist) bajo .env.prod", () => {
    const cmd = s.preview;
    expect(cmd).toContain(".env.prod");
    expect(cmd).toContain("start:prod");
    expect(cmd).not.toContain("tsx src/transports/http.ts");
  });
});
