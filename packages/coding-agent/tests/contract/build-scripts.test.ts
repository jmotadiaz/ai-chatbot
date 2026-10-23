import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrato de scripts por Entorno (tickets 07 y 04 de ADR 0011). package.json
 * es la interfaz del operador/CI/pm2: qué compila, dónde escribe, con qué
 * `--env` arranca y qué puede lanzar el `preview` canónico sin referencias
 * muertas ni ficheros `.env.*`.
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
  it("dev arranca install + tsx watch con --env=dev; el catálogo se sincroniza en arranque", () => {
    expect(s.dev).toContain("tsx scripts/install-packages.ts --env=dev");
    expect(s.dev).toContain("tsx watch src/transports/http.ts --env=dev");
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

describe("scripts del monorepo sin dotenv ni ficheros .env.* (ADR 0011)", () => {
  const all = { root: rootPkg.scripts, chatbot: chatbotPkg.scripts, worker: s };

  it("ningún script invoca dotenv ni carga .env.{dev,prod,test}", () => {
    for (const [pkg, scripts] of Object.entries(all)) {
      for (const [name, cmd] of Object.entries(scripts)) {
        expect(cmd, `${pkg}:${name}`).not.toContain("dotenv");
        expect(cmd, `${pkg}:${name}`).not.toMatch(/\.env\.(dev|prod|test|development)/);
      }
    }
  });

  it("los scripts que eligen Entorno lo hacen con --env=prod|dev|test", () => {
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

describe("sin referencias muertas a coding-agent transport:http", () => {
  const all = { root: rootPkg.scripts, chatbot: chatbotPkg.scripts, worker: s };
  it("ningún package.json invoca transport:http del worker", () => {
    for (const [pkg, scripts] of Object.entries(all)) {
      for (const [name, cmd] of Object.entries(scripts)) {
        expect(cmd, `${pkg}:${name}`).not.toContain("coding-agent transport:http");
      }
    }
  });

  it("raíz preview compila ambos packages con el gate y arranca los preview", () => {
    const cmd = rootPkg.scripts.preview;
    expect(cmd).toContain("db:prod:start");
    expect(cmd).toContain("--allow-prod-build");
    expect(cmd).toContain("--filter chatbot build");
    expect(cmd).toContain("--filter coding-agent build");
    expect(cmd).toContain("concurrently");
    expect(cmd).toContain("pnpm --filter chatbot preview");
    expect(cmd).toContain("pnpm --filter coding-agent preview");
  });

  it("chatbot preview solo arranca el servidor compilado (next-cli start --env=prod)", () => {
    const cmd = chatbotPkg.scripts.preview;
    expect(cmd).toContain("next-cli.ts start --env=prod --port=8085");
    expect(cmd).not.toContain("coding-agent");
    expect(cmd).not.toContain("db:prod:start");
    expect(cmd).not.toContain("next start");
  });

  it("coding-agent preview arranca el worker compilado bajo --env=prod", () => {
    const cmd = s.preview;
    expect(cmd).toContain("--allow-prod-build");
    expect(cmd).toContain("pnpm run build");
    expect(cmd).toContain("node --import tsx dist/transports/http.js --env=prod");
    expect(cmd).not.toContain("start:prod");
    expect(cmd).not.toContain("tsx src/transports/http.ts");
  });
});
