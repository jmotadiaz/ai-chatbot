import { describe, expect, it } from "vitest";
import { EMBEDDING_MODELS, EMBEDDING_ROLES } from "./embedding-catalog";

describe("EMBEDDING_MODELS integrity", () => {
  it("has unique ids", () => {
    const ids = EMBEDDING_MODELS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares a positive output dimensionality and at least one supported taskType per entry", () => {
    for (const entry of EMBEDDING_MODELS) {
      expect(entry.outputDimensionality).toBeGreaterThan(0);
      expect(entry.taskTypes.length).toBeGreaterThan(0);
    }
  });
});

describe("EMBEDDING_ROLES integrity", () => {
  it("every role points to an id that exists in EMBEDDING_MODELS", () => {
    const ids = new Set(EMBEDDING_MODELS.map((e) => e.id));
    for (const [role, id] of Object.entries(EMBEDDING_ROLES)) {
      expect(ids.has(id), `role "${role}" points at missing id "${id}"`).toBe(true);
    }
  });

  it("exposes the embedding role", () => {
    expect(EMBEDDING_ROLES.embedding).toBe("Gemini Embedding 001");
  });
});
