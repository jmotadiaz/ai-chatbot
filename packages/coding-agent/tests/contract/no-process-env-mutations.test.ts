import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestWorkerContext } from "../helpers/test-context";

/**
 * DI contract of the Coding Agent Worker (ADR 0011 §6 / ticket 02):
 *
 * 1. No file under `packages/coding-agent/tests/` configures tests by
 *    mutating `process.env.CODING_AGENT_*` / `process.env.MODEL_GATEWAY_*`
 *    (assignment, `delete` or `vi.stubEnv`), nor points at the prod/dev
 *    runtime dirs (`.pi-prod`, `.pi-dev`) as a destination — `process.env` is
 *    global, inheritable state and was the cause of the ADR 0011 incident.
 * 2. At runtime: the `createTestWorkerContext()` sandbox lives under
 *    `os.tmpdir()` and a catalog sync with the injected sandbox writes
 *    `models.json`/`auth.json` ONLY inside that sandbox.
 *
 * The incident that motivates this contract: a test that mutated
 * `MODEL_GATEWAY_API_KEY`/`CODING_AGENT_MODELS_JSON` forgot to isolate
 * `CODING_AGENT_AUTH_JSON`; the Vitest subprocess inherited the worker's prod
 * value and `ensureGatewayAuthJson()` overwrote `.pi-prod/auth.json`.
 */

const TESTS_ROOT = path.resolve(import.meta.dirname, "..");
const SELF = path.basename(fileURLToPath(import.meta.url));

/** Forbidden configuration mutations through environment variables. */
const FORBIDDEN: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "assignment to process.env.CODING_AGENT_* / MODEL_GATEWAY_* / PI_CODING_AGENT_DIR",
    pattern:
      /process\.env\.(?:CODING_AGENT_[A-Z0-9_]+|MODEL_GATEWAY_[A-Z0-9_]+|PI_CODING_AGENT_DIR)\s*=[^=]/,
  },
  {
    name: "computed assignment to process.env['CODING_AGENT_*' | 'MODEL_GATEWAY_*' | 'PI_CODING_AGENT_DIR']",
    pattern:
      /process\.env\[\s*["'`](?:CODING_AGENT_|MODEL_GATEWAY_|PI_CODING_AGENT_DIR)[^"'`]*["'`]\s*\]\s*=[^=]/,
  },
  {
    name: "delete process.env.CODING_AGENT_* / MODEL_GATEWAY_* / PI_CODING_AGENT_DIR",
    pattern: /delete\s+process\.env\.(?:CODING_AGENT_|MODEL_GATEWAY_|PI_CODING_AGENT_DIR)/,
  },
  {
    name: "vi.stubEnv('CODING_AGENT_*' | 'MODEL_GATEWAY_*' | 'PI_CODING_AGENT_DIR')",
    pattern: /vi\.stubEnv\(\s*["'`](?:CODING_AGENT_|MODEL_GATEWAY_|PI_CODING_AGENT_DIR)/,
  },
  {
    name: "literal .pi-prod / .pi-dev as a destination in a test string",
    // Without crossing lines: a docstring comment that mentions .pi-prod is
    // not a destination; a join(..., ".pi-prod/…") is.
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
      if (path.basename(file) === SELF) continue; // this contract lives off its own literals
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

      // Written inside the sandbox…
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
      // …and the request went to the injected URL, not to the bundle's.
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
