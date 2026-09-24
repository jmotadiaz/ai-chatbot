import { describe, expect, it } from "vitest";
import { RERANK_MODELS, RERANK_ROLES } from "./rerank-catalog";

describe("RERANK_MODELS integrity", () => {
  it("has unique ids", () => {
    const ids = RERANK_MODELS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("RERANK_ROLES integrity", () => {
  it("every role points to an id that exists in RERANK_MODELS", () => {
    const ids = new Set(RERANK_MODELS.map((e) => e.id));
    for (const [role, id] of Object.entries(RERANK_ROLES)) {
      expect(ids.has(id), `role "${role}" points at missing id "${id}"`).toBe(true);
    }
  });

  it("exposes the rerank role", () => {
    expect(RERANK_ROLES.rerank).toBe("Cohere Rerank v4 Pro");
  });
});
