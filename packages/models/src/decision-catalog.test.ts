import { describe, expect, it } from "vitest";
import { DECISION_MODELS, DECISION_ROLES } from "./decision-catalog";

describe("DECISION_MODELS / DECISION_ROLES integrity", () => {
  it("has unique ids", () => {
    const ids = DECISION_MODELS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry uses a decision endpoint kind (openrouterDecisions)", () => {
    for (const entry of DECISION_MODELS) {
      expect(entry.provider.kind).toBe("openrouterDecisions");
      expect(entry.provider.modelId.length).toBeGreaterThan(0);
    }
  });

  it("every role points at an id that exists in DECISION_MODELS", () => {
    const ids = new Set(DECISION_MODELS.map((e) => e.id));
    for (const [role, id] of Object.entries(DECISION_ROLES)) {
      expect(ids.has(id), `role "${role}" points at missing id "${id}"`).toBe(true);
    }
  });
});
