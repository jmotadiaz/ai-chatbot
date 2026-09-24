import { describe, expect, it } from "vitest";
import { MockEmbeddingModelV3 } from "ai/test";
import type { EmbeddingRole } from "models";
import { createEmbedResolver } from "../../src/embed";
import type { EmbeddingClients } from "../../src/clients/embedding";

function stubClients(overrides: Partial<EmbeddingClients> = {}): EmbeddingClients {
  return {
    google: (modelId) =>
      new MockEmbeddingModelV3({
        modelId,
        doEmbed: async ({ values }) => ({
          embeddings: values.map(() => [0.1, 0.2, 0.3]),
          usage: { tokens: 10 },
          warnings: [],
        }),
      }),
    ...overrides,
  };
}

describe("embed: Embedding Role -> embeddings", () => {
  it("resolves the embedding role to its catalog entry and returns one embedding per value", async () => {
    const embed = createEmbedResolver(stubClients());

    const embeddings = await embed("embedding", ["a", "b"], {
      taskType: "RETRIEVAL_DOCUMENT",
    });

    expect(embeddings).toEqual([
      [0.1, 0.2, 0.3],
      [0.1, 0.2, 0.3],
    ]);
  });

  it("applies the catalog's outputDimensionality and the caller's taskType as providerOptions.google", async () => {
    let captured: unknown;
    const google = (modelId: string) =>
      new MockEmbeddingModelV3({
        modelId,
        doEmbed: async (options) => {
          captured = options.providerOptions;
          return { embeddings: [[1, 2, 3]], usage: { tokens: 1 }, warnings: [] };
        },
      });
    const embed = createEmbedResolver(stubClients({ google }));

    await embed("embedding", ["hello"], { taskType: "SEMANTIC_SIMILARITY" });

    expect(captured).toEqual({
      google: { outputDimensionality: 768, taskType: "SEMANTIC_SIMILARITY" },
    });
  });

  it("resolves the client using the catalog entry's provider modelId, not the role", async () => {
    let calledWith: string | undefined;
    const google = (modelId: string) => {
      calledWith = modelId;
      return new MockEmbeddingModelV3({
        modelId,
        doEmbed: async () => ({ embeddings: [[0]], usage: { tokens: 1 }, warnings: [] }),
      });
    };
    const embed = createEmbedResolver(stubClients({ google }));

    await embed("embedding", ["x"], { taskType: "RETRIEVAL_QUERY" });

    expect(calledWith).toBe("gemini-embedding-001");
  });

  it("rejects a taskType the catalog entry does not declare supported", async () => {
    const embed = createEmbedResolver(stubClients());

    await expect(
      embed("embedding", ["x"], {
        // @ts-expect-error -- deliberately invalid to prove runtime validation
        taskType: "NOT_A_REAL_TASK_TYPE",
      }),
    ).rejects.toThrow(/does not support taskType/);
  });

  it("throws for a role absent from EMBEDDING_ROLES", async () => {
    const embed = createEmbedResolver(stubClients());

    await expect(
      embed("not-a-real-role" as EmbeddingRole, ["x"], {
        taskType: "RETRIEVAL_QUERY",
      }),
    ).rejects.toThrow(/Embedding role/);
  });
});
