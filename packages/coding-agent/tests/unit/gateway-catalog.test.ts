import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGatewayScenario } from "@ai-chatbot/model-gateway-testing";
import type {
  GatewayScenario,
  GatewayScenarioConfig,
} from "@ai-chatbot/model-gateway-testing";
import { startGatewayServer } from "@ai-chatbot/model-gateway-testing/server";
import type { GatewayServer } from "@ai-chatbot/model-gateway-testing/server";
import {
  buildPiModelsJson,
  buildThinkingLevelMap,
  ensureGatewayAuthJson,
  ensureGatewayModelsJson,
  getSyncedGatewayCatalog,
  resetGatewayCatalogForTests,
  type GatewayModelEntry,
} from "../../src/runtime/gateway-catalog";
import type { GatewayRuntimeConfig } from "../../src/runtime/runtime-config";

const GATEWAY_URL = "http://127.0.0.1:4098";
const GATEWAY_KEY = "gw-secret-1";

function entry(overrides: Partial<GatewayModelEntry> = {}): GatewayModelEntry {
  return {
    id: "Kimi K3.1 Pro",
    company: "moonshotai",
    isDefault: false,
    contextWindow: 262_144,
    maxTokens: 32_768,
    cost: { input: 0.6, output: 2.5, cacheRead: 0.15, cacheWrite: 0 },
    reasoning: true,
    thinkingLevels: ["low", "medium", "high"],
    defaultThinkingLevel: "medium",
    supportedFiles: ["img", "pdf"],
    supportedOutput: ["text"],
    zeroDataRetention: false,
    temperature: 0.6,
    topP: 0.95,
    topK: null,
    ...overrides,
  };
}

describe("buildPiModelsJson", () => {
  it("emits a single model-gateway provider with baseUrl/api/apiKey", () => {
    const json = buildPiModelsJson([entry()], GATEWAY_URL);
    const provider = json.providers["model-gateway"];
    expect(Object.keys(json.providers)).toEqual(["model-gateway"]);
    expect(provider.baseUrl).toBe(`${GATEWAY_URL}/v1`);
    expect(provider.api).toBe("openai-completions");
    expect(provider.apiKey).toBe("$MODEL_GATEWAY_API_KEY");
  });

  it("translates each catalog entry 1:1 (Pi model id = catalog id)", () => {
    const json = buildPiModelsJson([entry()], GATEWAY_URL);
    expect(json.providers["model-gateway"].models).toEqual([
      {
        id: "Kimi K3.1 Pro",
        name: "Kimi K3.1 Pro",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 262_144,
        maxTokens: 32_768,
        cost: { input: 0.6, output: 2.5, cacheRead: 0.15, cacheWrite: 0 },
        thinkingLevelMap: {
          minimal: null,
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: null,
          max: null,
        },
      },
    ]);
  });

  it("maps supportedFiles img to ['text','image'] and text-only otherwise", () => {
    const json = buildPiModelsJson(
      [entry({ supportedFiles: ["img", "pdf"] }), entry({ id: "Text only", supportedFiles: [], reasoning: false, thinkingLevels: [] })],
      GATEWAY_URL,
    );
    const [withImg, textOnly] = json.providers["model-gateway"].models;
    expect(withImg.input).toEqual(["text", "image"]);
    expect(textOnly.input).toEqual(["text"]);
    expect(textOnly.reasoning).toBe(false);
    expect(textOnly.thinkingLevelMap).toBeUndefined();
  });

  it("declares xhigh explicitly only when the catalog lists it (opt-in for Pi)", () => {
    expect(buildThinkingLevelMap(entry({ thinkingLevels: ["low", "high", "xhigh"] }))?.xhigh).toBe("xhigh");
    expect(buildThinkingLevelMap(entry())?.xhigh).toBeNull();
    // "off" stays unmapped: Pi treats an absent entry as supported with no
    // provider reasoning effort.
    expect(buildThinkingLevelMap(entry())?.off).toBeUndefined();
  });
});

describe("ensureGatewayAuthJson", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "gateway-auth-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("creates the file with the model-gateway entry when missing", () => {
    const authPath = path.join(tmp, "nested", "auth.json");
    ensureGatewayAuthJson(authPath, GATEWAY_KEY);
    expect(JSON.parse(readFileSync(authPath, "utf8"))).toEqual({
      "model-gateway": { type: "api_key", key: GATEWAY_KEY },
    });
  });

  it("preserves existing entries and refreshes a stale key", () => {
    const authPath = path.join(tmp, "auth.json");
    writeFileSync(
      authPath,
      JSON.stringify({ "opencode-go": { type: "api_key", key: "oc_1" } }),
    );
    ensureGatewayAuthJson(authPath, GATEWAY_KEY);
    const auth = JSON.parse(readFileSync(authPath, "utf8"));
    expect(auth["opencode-go"]).toEqual({ type: "api_key", key: "oc_1" });
    expect(auth["model-gateway"]).toEqual({ type: "api_key", key: GATEWAY_KEY });

    // Matching key: no rewrite needed (file content is already correct).
    const before = readFileSync(authPath, "utf8");
    ensureGatewayAuthJson(authPath, GATEWAY_KEY);
    expect(readFileSync(authPath, "utf8")).toBe(before);
  });
});

/**
 * `ensureGatewayModelsJson` / `syncGatewayModelsFile` ARE the Gateway transport
 * of the Worker (catalog URL, bearer auth, error paths), so this suite serves
 * the catalog from the official toolkit's HTTP server instead of stubbing
 * `fetch`: the worker's real `fetch` crosses a real socket, and only the
 * ephemeral origin injected into its config can answer — a hardcoded or
 * misspelled URL fails the test. Connection failure is a genuine
 * `ECONNREFUSED` (the server is closed before the call), never a fake
 * rejection.
 */
describe("ensureGatewayModelsJson", () => {
  let tmp: string;
  let modelsPath: string;
  let authPath: string;
  let gateway: Required<GatewayRuntimeConfig>;
  let server: GatewayServer | undefined;

  beforeEach(() => {
    resetGatewayCatalogForTests();
    tmp = mkdtempSync(path.join(tmpdir(), "gateway-catalog-"));
    modelsPath = path.join(tmp, "models.json");
    authPath = path.join(tmp, "auth.json");
  });

  afterEach(async () => {
    // Each test releases its own server; `close()` is idempotent, so a test
    // that closed it to simulate a dead Gateway is safe here too.
    await server?.close();
    server = undefined;
    rmSync(tmp, { recursive: true, force: true });
    resetGatewayCatalogForTests();
  });

  /**
   * Starts a gateway server for `config` and points the injected worker config
   * at its ephemeral URL. The catalog entries are the Worker's own.
   */
  async function serveGateway(
    config: GatewayScenarioConfig = {},
  ): Promise<GatewayScenario> {
    const scope = createGatewayScenario(config);
    server = await startGatewayServer(scope);
    // Explicit DI (ADR 0011 §6): credentials and paths passed as parameters,
    // never through process.env.
    gateway = {
      gatewayUrl: server.url,
      apiKey: GATEWAY_KEY,
      modelsJsonPath: modelsPath,
      authJsonPath: authPath,
    };
    return scope;
  }

  it("writes models.json + auth.json and exposes the synced catalog in memory", async () => {
    const scope = await serveGateway({ catalog: { public: [entry()] } });

    const catalog = await ensureGatewayModelsJson(gateway);

    expect(catalog.map((m) => m.id)).toEqual(["Kimi K3.1 Pro"]);
    // The request reached THIS origin's catalog route with the injected key.
    expect(scope.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /v1/models/catalog",
    ]);
    expect(scope.requests[0]?.headers.authorization).toBe(`Bearer ${GATEWAY_KEY}`);
    expect(getSyncedGatewayCatalog().map((m) => m.id)).toEqual(["Kimi K3.1 Pro"]);

    const json = JSON.parse(readFileSync(modelsPath, "utf8"));
    expect(json.providers["model-gateway"].baseUrl).toBe(`${gateway.gatewayUrl}/v1`);
    expect(json.providers["model-gateway"].models[0].id).toBe("Kimi K3.1 Pro");
    expect(JSON.parse(readFileSync(authPath, "utf8"))["model-gateway"]).toEqual({
      type: "api_key",
      key: GATEWAY_KEY,
    });
  });

  it("preserves other auth.json entries when syncing", async () => {
    writeFileSync(
      authPath,
      JSON.stringify({ "opencode-go": { type: "api_key", key: "oc_1" } }),
    );
    await serveGateway({ catalog: { public: [entry()] } });

    await ensureGatewayModelsJson(gateway);

    const auth = JSON.parse(readFileSync(authPath, "utf8"));
    expect(auth["opencode-go"]).toEqual({ type: "api_key", key: "oc_1" });
    expect(auth["model-gateway"].key).toBe(GATEWAY_KEY);
  });

  it("fails with an actionable error when the Gateway is unreachable", async () => {
    // A server that answers once and is gone: the ephemeral port is free again,
    // so the worker's fetch hits a real `ECONNREFUSED`.
    await serveGateway({ catalog: { public: [entry()] } });
    await server?.close();

    await expect(ensureGatewayModelsJson(gateway)).rejects.toThrow(
      /MODEL_GATEWAY_URL.*model-gateway\.service/s,
    );
    expect(existsSync(modelsPath)).toBe(false);
    expect(getSyncedGatewayCatalog()).toEqual([]);
  });

  it("fails on a non-2xx response (e.g. unauthorized)", async () => {
    // The toolkit rejects any request without credentials: the worker's 401
    // path runs against a real HTTP 401, status line included.
    await serveGateway({ catalog: { public: [entry()] }, authorize: () => false });

    await expect(ensureGatewayModelsJson(gateway)).rejects.toThrow(/401/);
    expect(existsSync(modelsPath)).toBe(false);
  });

  it("fails on a malformed catalog payload", async () => {
    // Entries pass through untouched: the Worker validates the catalog schema.
    await serveGateway({ catalog: { public: [{ nope: true }] } });

    await expect(ensureGatewayModelsJson(gateway)).rejects.toThrow(/malformed/);
  });

  it("fails when the API key is explicitly unset, before touching the disk", async () => {
    // `apiKey: ""` (explicit DI) = no credential: validation runs before the
    // fetch and before writing anything, with no environment variables involved.
    const scope = await serveGateway({ catalog: { public: [entry()] } });

    await expect(
      ensureGatewayModelsJson({ ...gateway, apiKey: "" }),
    ).rejects.toThrow(/MODEL_GATEWAY_API_KEY/);
    expect(scope.requests).toEqual([]);
    expect(existsSync(modelsPath)).toBe(false);
  });
});
