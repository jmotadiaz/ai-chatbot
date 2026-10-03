import { describe, expect, it } from "vitest";
import { SPEECH_MODELS, SPEECH_ROLES } from "./speech-catalog";

describe("SPEECH_MODELS / SPEECH_ROLES integrity", () => {
  it("has unique ids", () => {
    const ids = SPEECH_MODELS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every role points at an id that exists in SPEECH_MODELS", () => {
    const speechIds = new Set(SPEECH_MODELS.map((e) => e.id));
    for (const [role, id] of Object.entries(SPEECH_ROLES)) {
      expect(speechIds.has(id), `role "${role}" -> "${id}"`).toBe(true);
    }
  });
});
