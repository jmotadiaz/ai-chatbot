import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpResponse, http } from "msw";
import { config } from "config";
import { setupGatewayHarness } from "../../helpers/gateway-harness";
import { gatewayHeaders } from "@/lib/infrastructure/ai/gateway";
import { TEST_INTERNAL_MODELS, TEST_MODELS } from "@/tests/mocks/gateway/catalog";

const gateway = setupGatewayHarness();
const url = `${config.modelGatewayUrl()}/v1/models/catalog`;
const allModels = [...TEST_MODELS, ...TEST_INTERNAL_MODELS];
let calls: Array<{ internal: boolean; authorization: string | null }>;
let now: number;

const loadClient = async () => {
  vi.resetModules();
  return import("@/lib/infrastructure/ai/catalog");
};

function serveCatalog(respond?: (internal: boolean) => Response) {
  gateway.server.use(
    http.get(url, ({ request }) => {
      const internal = new URL(request.url).searchParams.get("include_internal") === "true";
      calls.push({ internal, authorization: request.headers.get("authorization") });
      return respond?.(internal) ?? HttpResponse.json({
        models: internal ? allModels : TEST_MODELS,
      });
    }),
  );
}

beforeEach(() => {
  calls = [];
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => vi.restoreAllMocks());

describe("Model Gateway catalog client", () => {
  it("requests authenticated public and internal views separately", async () => {
    serveCatalog();
    const client = await loadClient();
    await expect(client.fetchPublicModelCatalog()).resolves.toEqual(TEST_MODELS);
    await expect(client.fetchInternalModelCatalog()).resolves.toEqual(allModels);
    expect(calls).toEqual([
      { internal: false, authorization: gatewayHeaders().Authorization },
      { internal: true, authorization: gatewayHeaders().Authorization },
    ]);
  });

  it("caches each view independently until the 60 second TTL expires", async () => {
    serveCatalog();
    const client = await loadClient();
    await client.fetchPublicModelCatalog();
    await client.fetchInternalModelCatalog();
    now += 59_999;
    await client.fetchPublicModelCatalog();
    await client.fetchInternalModelCatalog();
    expect(calls.map((call) => call.internal)).toEqual([false, true]);
    now += 1;
    await client.fetchPublicModelCatalog();
    expect(calls.map((call) => call.internal)).toEqual([false, true, false]);
  });

  it("reports failed and malformed responses and retries failures", async () => {
    let response: Response = new HttpResponse(null, { status: 503, statusText: "Service Unavailable" });
    serveCatalog(() => response);
    const client = await loadClient();
    await expect(client.fetchPublicModelCatalog()).rejects.toThrow("503 Service Unavailable");
    response = HttpResponse.json({ data: TEST_MODELS });
    await expect(client.fetchPublicModelCatalog()).rejects.toThrow("models");
    response = HttpResponse.json({ models: TEST_MODELS });
    await expect(client.fetchPublicModelCatalog()).resolves.toEqual(TEST_MODELS);
    expect(calls).toHaveLength(3);
  });

  it("rejects cold snapshots and exposes warmed catalog views", async () => {
    serveCatalog();
    const client = await loadClient();
    expect(() => client.getPublicModelCatalogSnapshot()).toThrow("Public model catalog is cold");
    expect(() => client.getModelCatalogSnapshot()).toThrow("Model catalog is cold");
    await client.warmModelCatalog();
    expect(client.getModelCatalogSnapshot()).toEqual(allModels);
    expect(client.getPublicModelCatalogSnapshot()).toEqual(TEST_MODELS);
  });
});
