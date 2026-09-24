import { describe, expect, it, vi } from "vitest";
import { createDecideResolver } from "../../src/decide";
import type { DecideOptions, DecisionsClient, DecisionsClients } from "../../src/types";

const question: DecideOptions["question"] = {
  instructions: "Pick one.",
  criteria: { a: "first", b: "second" },
};

const stubClient = (
  create: DecisionsClient["alpha"]["decisions"]["create"],
): DecisionsClients => ({
  openrouterDecisions: () => ({ alpha: { decisions: { create } } }) as unknown as DecisionsClient,
});

describe("createDecideResolver: catalog id / Model Role resolution", () => {
  it("throws for a model id/role absent from DECISION_MODELS/DECISION_ROLES", async () => {
    const decide = createDecideResolver(stubClient(vi.fn()));

    await expect(
      decide({
        model: "not-a-real-decision-model" as DecideOptions["model"],
        question,
        state: {},
      }),
    ).rejects.toThrow(/not found in DECISION_MODELS/);
  });

  it("does not call the Decisions client when the model does not resolve", async () => {
    const create = vi.fn();
    const decide = createDecideResolver(stubClient(create));

    await expect(
      decide({ model: "nope" as DecideOptions["model"], question, state: {} }),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
