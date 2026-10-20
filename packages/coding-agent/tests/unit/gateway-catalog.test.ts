import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPiModelsJson,
  buildThinkingLevelMap,
  ensureGatewayAuthJson,
  ensureGatewayModelsJson,
  getSyncedGatewayCatalog,
  resetGatewayCatalogForTests,
  type GatewayModelEntry,
} from "../../src/runtime/gateway-catalog";

const GATEWAY_URL = "http://127.0.0.1:4098";
const GATEWAY_KEY = "gw-secret-1";

function entry(overrides: Partial<GatewayModelEntry> = {}): GatewayModelEntry {
  return {
    id: "Kimi K3",
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
        id: "Kimi K3",
        name: "Kimi K3",
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

describe("ensureGatewayModelsJson", () => {
  let tmp: string;
  let modelsPath: string;
  let authPath: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    resetGatewayCatalogForTests();
    tmp = mkdtempSync(path.join(tmpdir(), "gateway-catalog-"));
    modelsPath = path.join(tmp, "models.json");
    authPath = path.join(tmp, "auth.json");
    for (const key of [
      "CODING_AGENT_MODELS_JSON",
      "CODING_AGENT_AUTH_JSON",
      "MODEL_GATEWAY_URL",
      "MODEL_GATEWAY_API_KEY",
    ]) {
      savedEnv[key] = process.env[key];
    }
    process.env.CODING_AGENT_MODELS_JSON = modelsPath;
    process.env.CODING_AGENT_AUTH_JSON = authPath;
    process.env.MODEL_GATEWAY_URL = GATEWAY_URL;
    process.env.MODEL_GATEWAY_API_KEY = GATEWAY_KEY;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    vi.unstubAllGlobals();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetGatewayCatalogForTests();
  });

  it("writes models.json + auth.json and exposes the synced catalog in memory", async () => {
    const fetchMock = vi.fn(async () => Response.json({ models: [entry()] }));
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await ensureGatewayModelsJson();

    expect(catalog.map((m) => m.id)).toEqual(["Kimi K3"]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${GATEWAY_URL}/v1/models/catalog`);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toEqual({
      Authorization: `Bearer ${GATEWAY_KEY}`,
    });
    expect(getSyncedGatewayCatalog().map((m) => m.id)).toEqual(["Kimi K3"]);

    const json = JSON.parse(readFileSync(modelsPath, "utf8"));
    expect(json.providers["model-gateway"].baseUrl).toBe(`${GATEWAY_URL}/v1`);
    expect(json.providers["model-gateway"].models[0].id).toBe("Kimi K3");
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
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: [entry()] })));

    await ensureGatewayModelsJson();

    const auth = JSON.parse(readFileSync(authPath, "utf8"));
    expect(auth["opencode-go"]).toEqual({ type: "api_key", key: "oc_1" });
    expect(auth["model-gateway"].key).toBe(GATEWAY_KEY);
  });

  it("fails with an actionable error when the Gateway is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    await expect(ensureGatewayModelsJson()).rejects.toThrow(
      /MODEL_GATEWAY_URL.*model-gateway\.service/s,
    );
    expect(existsSync(modelsPath)).toBe(false);
    expect(getSyncedGatewayCatalog()).toEqual([]);
  });

  it("fails on a non-2xx response (e.g. unauthorized)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })),
    );

    await expect(ensureGatewayModelsJson()).rejects.toThrow(/401/);
    expect(existsSync(modelsPath)).toBe(false);
  });

  it("fails on a malformed catalog payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: [{ nope: true }] })));

    await expect(ensureGatewayModelsJson()).rejects.toThrow(/malformed/);
  });

  it("fails when MODEL_GATEWAY_API_KEY is unset, before touching the disk", async () => {
    delete process.env.MODEL_GATEWAY_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureGatewayModelsJson()).rejects.toThrow(/MODEL_GATEWAY_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(existsSync(modelsPath)).toBe(false);
  });
});
