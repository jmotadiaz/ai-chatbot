import { describe, expect, it } from "vitest";
import { MODEL_CATALOG } from "models";
import {
  chatModelKeys,
  defaultModel,
  resolveChatModelId,
} from "@/lib/features/foundation-model/config";

describe("resolveChatModelId", () => {
  it("keeps a model id that is still selectable", () => {
    const selectable = chatModelKeys.at(-1)!;
    expect(selectable).not.toBe(defaultModel);

    expect(resolveChatModelId(selectable)).toBe(selectable);
  });

  // Projects seeded with a model the picker no longer offers (the e2e project
  // chat uses Llama 4 Scout) keep answering with it.
  it("keeps a catalog model that is not offered in the picker", () => {
    const unlisted = MODEL_CATALOG.find((entry) => !entry.userInvocable)!.id;

    expect(resolveChatModelId(unlisted)).toBe(unlisted);
  });

  it.each([
    ["a NULL column", null],
    ["a missing value", undefined],
    ["an id retired from the catalog", "Retired Model 0.9"],
  ])("falls back to the default model for %s", (_, persisted) => {
    expect(resolveChatModelId(persisted)).toBe(defaultModel);
  });
});
