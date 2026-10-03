import { describe, expect, it } from "vitest";
import { MODEL_CATALOG } from "./catalog";
import { LANGUAGE_MODEL_ROLES } from "./language-roles";

describe("LANGUAGE_MODEL_ROLES integrity", () => {
  const catalogIds = new Set(MODEL_CATALOG.map((e) => e.id));

  it("every role points at an id that exists in MODEL_CATALOG", () => {
    for (const [role, id] of Object.entries(LANGUAGE_MODEL_ROLES)) {
      expect(catalogIds.has(id), `role "${role}" -> "${id}"`).toBe(true);
    }
  });

  it("is not empty (every internal call site the ticket lists has a role)", () => {
    expect(Object.keys(LANGUAGE_MODEL_ROLES).length).toBeGreaterThan(0);
  });

  it("covers the two compaction roles distinctly (runtime hasMultimedia branch)", () => {
    expect(LANGUAGE_MODEL_ROLES.compactionText).not.toBe(
      LANGUAGE_MODEL_ROLES.compactionMultimedia,
    );
  });
});
