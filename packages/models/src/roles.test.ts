import { describe, expect, it } from "vitest";
import { LANGUAGE_MODEL_ROLES } from "./language-roles";
import { SPEECH_ROLES } from "./speech-catalog";
import { EMBEDDING_ROLES } from "./embedding-catalog";
import { RERANK_ROLES } from "./rerank-catalog";
import { MODEL_ROLES } from "./roles";

describe("MODEL_ROLES", () => {
  it("is the union of every per-operation role map", () => {
    expect(MODEL_ROLES).toEqual({
      ...LANGUAGE_MODEL_ROLES,
      ...SPEECH_ROLES,
      ...EMBEDDING_ROLES,
      ...RERANK_ROLES,
    });
  });

  it("keeps role names disjoint across maps", () => {
    const names = [
      ...Object.keys(LANGUAGE_MODEL_ROLES),
      ...Object.keys(SPEECH_ROLES),
      ...Object.keys(EMBEDDING_ROLES),
      ...Object.keys(RERANK_ROLES),
    ];
    expect(new Set(names).size).toBe(names.length);
  });
});
