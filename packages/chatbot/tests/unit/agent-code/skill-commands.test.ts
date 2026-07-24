import { describe, expect, it } from "vitest";
import {
  parseLeadingSkillCommands,
  prependSkillCommands,
} from "@/lib/features/code/skill-commands";

describe("coding-agent skill commands", () => {
  it("prepends several selected skills to the user text", () => {
    expect(
      prependSkillCommands("Review this change", [
        "code-review",
        "find-docs",
      ]),
    ).toBe(
      "/skill:code-review /skill:find-docs\n\nReview this change",
    );
  });

  it("extracts only consecutive skill commands at the start", () => {
    expect(
      parseLeadingSkillCommands(
        "/skill:code-review /skill:find-docs\n\nReview this change",
      ),
    ).toEqual({
      skills: ["code-review", "find-docs"],
      text: "Review this change",
    });
    expect(parseLeadingSkillCommands("Use /skill:code-review here")).toEqual({
      skills: [],
      text: "Use /skill:code-review here",
    });
  });
});
