import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { assertSkillOverridesApplied } from "../../src/skill-overrides";

describe("assertSkillOverridesApplied", () => {
  let overrideDir: string;

  beforeEach(() => {
    overrideDir = join(tmpdir(), `skill-overrides-test-${crypto.randomUUID()}`);
    for (const name of ["alpha", "beta"]) {
      const dir = join(overrideDir, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        `---\nname: ${name}\ndescription: ${name}\n---\n${name}\n`,
      );
    }
  });

  afterEach(() => {
    rmSync(overrideDir, { recursive: true, force: true });
  });

  it("accepts the override layer when every discovered skill is the winner", () => {
    const expected = loadSkillsFromDir({ dir: overrideDir, source: "test" });
    expect(() =>
      assertSkillOverridesApplied(
        { getSkills: () => expected },
        overrideDir,
      ),
    ).not.toThrow();
  });

  it("reports every override that is missing or shadowed", () => {
    const expected = loadSkillsFromDir({ dir: overrideDir, source: "test" });
    const originalBeta = {
      ...expected.skills.find((skill) => skill.name === "beta")!,
      filePath: join(overrideDir, "original-beta", "SKILL.md"),
    };

    expect(() =>
      assertSkillOverridesApplied(
        {
          getSkills: () => ({
            skills: [originalBeta],
            diagnostics: [],
          }),
        },
        overrideDir,
      ),
    ).toThrow(/alpha: expected .* got missing.*beta: expected .* got .*original-beta/);
  });
});
