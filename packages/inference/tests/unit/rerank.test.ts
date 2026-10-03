import { describe, expect, it } from "vitest";
import { MockRerankingModelV3 } from "ai/test";
import type { RerankRole } from "models";
import { createRerankResolver } from "../../src/rerank";
import type { RerankClients } from "../../src/clients/rerank";

function stubClients(overrides: Partial<RerankClients> = {}): RerankClients {
  return {
    cohere: (modelId) =>
      new MockRerankingModelV3({
        modelId,
        doRerank: async ({ documents }) => ({
          ranking:
            documents.type === "text"
              ? documents.values.map((_, index) => ({
                  index,
                  relevanceScore: 1 - index * 0.1,
                }))
              : [],
        }),
      }),
    ...overrides,
  };
}

describe("rerank: Rerank Role -> reranked results", () => {
  it("resolves the rerank role to its catalog entry and returns { originalIndex, score }[]", async () => {
    const rerank = createRerankResolver(stubClients());

    const results = await rerank("rerank", {
      query: "q",
      documents: ["doc a", "doc b"],
    });

    expect(results).toEqual([
      { originalIndex: 0, score: 1, document: "doc a" },
      { originalIndex: 1, score: 0.9, document: "doc b" },
    ]);
  });

  it("resolves the client using the catalog entry's provider modelId, not the role", async () => {
    let calledWith: string | undefined;
    const cohere = (modelId: string) => {
      calledWith = modelId;
      return new MockRerankingModelV3({
        modelId,
        doRerank: async () => ({ ranking: [] }),
      });
    };
    const rerank = createRerankResolver(stubClients({ cohere }));

    await rerank("rerank", { query: "q", documents: ["a"] });

    expect(calledWith).toBe("rerank-v4.0-pro");
  });

  it("forwards topN to the model call", async () => {
    let receivedTopN: number | undefined;
    const cohere = (modelId: string) =>
      new MockRerankingModelV3({
        modelId,
        doRerank: async (options) => {
          receivedTopN = options.topN;
          return { ranking: [] };
        },
      });
    const rerank = createRerankResolver(stubClients({ cohere }));

    await rerank("rerank", { query: "q", documents: ["a", "b"], topN: 1 });

    expect(receivedTopN).toBe(1);
  });

  it("throws for a role absent from RERANK_ROLES", async () => {
    const rerank = createRerankResolver(stubClients());

    await expect(
      rerank("not-a-real-role" as RerankRole, { query: "q", documents: ["a"] }),
    ).rejects.toThrow(/Rerank role/);
  });
});
