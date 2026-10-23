import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestWorkerContext } from "../helpers/test-context";

/**
 * Contrato de DI del Coding Agent Worker (ADR 0011 §6 / ticket 02):
 *
 * 1. Ningún fichero bajo `packages/coding-agent/tests/` configura tests
 *    mutando `process.env.CODING_AGENT_*` / `process.env.MODEL_GATEWAY_*`
 *    (asignación, `delete` o `vi.stubEnv`), ni apunta a los runtime dirs de
 *    prod/dev (`.pi-prod`, `.pi-dev`) como destino — `process.env` es estado
 *    global heredable y fue la causa del incidente de ADR 0011.
 * 2. En runtime: el sandbox de `createTestWorkerContext()` vive bajo
 *    `os.tmpdir()` y un sync del catálogo con el sandbox inyectado escribe
 *    `models.json`/`auth.json` SOLO dentro de ese sandbox.
 *
 * El incidente que motiva este contrato: un test que mutaba
 * `MODEL_GATEWAY_API_KEY`/`CODING_AGENT_MODELS_JSON` olvidó aislar
 * `CODING_AGENT_AUTH_JSON`; el subproceso de Vitest heredó el valor de prod
 * del worker y `ensureGatewayAuthJson()` sobrescribió `.pi-prod/auth.json`.
 */

const TESTS_ROOT = path.resolve(import.meta.dirname, "..");
const SELF = path.basename(fileURLToPath(import.meta.url));

/** Mutaciones prohibidas de la configuración por variables de entorno. */
const FORBIDDEN: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "assignment to process.env.CODING_AGENT_* / MODEL_GATEWAY_*",
    pattern:
      /process\.env\.(?:CODING_AGENT_[A-Z0-9_]+|MODEL_GATEWAY_[A-Z0-9_]+)\s*=[^=]/,
  },
  {
    name: "computed assignment to process.env['CODING_AGENT_*' | 'MODEL_GATEWAY_*']",
    pattern:
      /process\.env\[\s*["'`](?:CODING_AGENT_|MODEL_GATEWAY_)[^"'`]*["'`]\s*\]\s*=[^=]/,
  },
  {
    name: "delete process.env.CODING_AGENT_* / MODEL_GATEWAY_*",
    pattern: /delete\s+process\.env\.(?:CODING_AGENT_|MODEL_GATEWAY_)/,
  },
  {
    name: "vi.stubEnv('CODING_AGENT_*' | 'MODEL_GATEWAY_*')",
    pattern: /vi\.stubEnv\(\s*["'`](?:CODING_AGENT_|MODEL_GATEWAY_)/,
  },
  {
    name: "literal .pi-prod / .pi-dev as a destination in a test string",
    // Sin cruzar líneas: un comentario de docstring que mencione .pi-prod no
    // es un destino; un join(..., \".pi-prod/…\") sí lo es.
    pattern: /["'`][^"'`\n]*\.pi-(?:prod|dev)/,
  },
];

function listTestFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listTestFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

describe("no process.env mutations in packages/coding-agent/tests", () => {
  it("never mutates CODING_AGENT_* / MODEL_GATEWAY_* nor targets .pi-prod/.pi-dev", () => {
    const violations: string[] = [];
    for (const file of listTestFiles(TESTS_ROOT)) {
      if (path.basename(file) === SELF) continue; // este contrato vive de sus propios literales
      const source = readFileSync(file, "utf8");
      for (const { name, pattern } of FORBIDDEN) {
        const match = source.match(pattern);
        if (match) {
          const line = source.slice(0, match.index).split("\n").length;
          violations.push(
            `${path.relative(TESTS_ROOT, file)}:${line} — ${name}: ${match[0].trim()}`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("test sandbox isolation (runtime)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createTestWorkerContext lives under the OS temp dir and never in the package", () => {
    const ctx = createTestWorkerContext();
    try {
      const tmpRoot = path.resolve(os.tmpdir()) + path.sep;
      expect((path.resolve(ctx.root) + path.sep).startsWith(tmpRoot)).toBe(true);
      for (const dir of [
        ctx.projectsRoot,
        ctx.sessionsDir,
        ctx.agentDir,
        ctx.piPackagesDir,
        ctx.artifactsDir,
        ctx.traceDir,
      ]) {
        expect(dir.startsWith(ctx.root + path.sep)).toBe(true);
        expect(statSync(dir).isDirectory()).toBe(true);
      }
      expect(ctx.modelsJsonPath.startsWith(ctx.root + path.sep)).toBe(true);
      expect(ctx.authJsonPath.startsWith(ctx.root + path.sep)).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("syncGatewayModelsFile with the injected sandbox writes models.json/auth.json ONLY inside it", async () => {
    const { syncGatewayModelsFile } = await import("../../src/runtime/gateway-catalog");
    const ctx = createTestWorkerContext({
      gatewayUrl: "http://127.0.0.1:4097",
      apiKey: "contract-key",
    });
    try {
      const fetchMock = vi.fn(async () => Response.json({ models: [] }));
      vi.stubGlobal("fetch", fetchMock);
      expect(fetchMock).toHaveBeenCalledTimes(0);

      await syncGatewayModelsFile(ctx.workerConfig);

      // Escritos dentro del sandbox…
      expect(existsSync(ctx.modelsJsonPath)).toBe(true);
      expect(existsSync(ctx.authJsonPath)).toBe(true);
      expect(JSON.parse(readFileSync(ctx.authJsonPath, "utf8"))["model-gateway"]).toEqual({
        type: "api_key",
        key: "contract-key",
      });
      for (const file of [ctx.modelsJsonPath, ctx.authJsonPath]) {
        const relative = path.relative(ctx.root, file);
        expect(relative.startsWith("..")).toBe(false);
        expect(path.isAbsolute(relative)).toBe(false);
      }
      // …y la petición salió contra la URL inyectada, no contra la del bundle.
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        "http://127.0.0.1:4097/v1/models/catalog",
      );
      expect(
        (fetchMock.mock.calls[0]?.[1] as RequestInit).headers,
      ).toEqual({ Authorization: "Bearer contract-key" });
    } finally {
      ctx.cleanup();
    }
  });
});
