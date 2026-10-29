import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createVitest } from "vitest/node";

// Contract for the execution profiles (ADR 0013, ticket 01): the files each
// Vitest config actually selects, checked against every chatbot test file on
// disk. Playwright suites under `tests/e2e` are outside Vitest and excluded.
const PACKAGE_ROOT = path.resolve(__dirname, "../../..");

function allTestFilesOnDisk(): string[] {
  return readdirSync(path.join(PACKAGE_ROOT, "tests"), { recursive: true })
    .map((entry) => entry.toString().split(path.sep).join("/"))
    .filter((entry) => /\.test\.tsx?$/.test(entry) && !entry.startsWith("e2e/"))
    .map((entry) => `tests/${entry}`)
    .sort();
}

async function selectedBy(config: string): Promise<string[]> {
  const vitest = await createVitest(
    "test",
    { root: PACKAGE_ROOT, config, watch: false, passWithNoTests: true },
  );
  try {
    const { testFiles } = await vitest.projects[0].globTestFiles();
    return testFiles
      .map((file) => path.relative(PACKAGE_ROOT, file).split(path.sep).join("/"))
      .sort();
  } finally {
    await vitest.close();
  }
}

describe("execution profile selection", () => {
  it("selects every chatbot test file in exactly one profile", async () => {
    const onDisk = allTestFilesOnDisk();
    const defaultProfile = await selectedBy("vitest.config.ts");
    const infraProfile = await selectedBy("vitest.infra.config.ts");

    const overlap = defaultProfile.filter((file) => infraProfile.includes(file));
    const uncovered = onDisk.filter(
      (file) => !defaultProfile.includes(file) && !infraProfile.includes(file),
    );

    expect(overlap).toEqual([]);
    expect(uncovered).toEqual([]);
    expect(defaultProfile.length + infraProfile.length).toBe(onDisk.length);
  });

  it("keeps both the current and the capability unit layouts in the default profile", async () => {
    const defaultProfile = await selectedBy("vitest.config.ts");

    expect(defaultProfile.some((file) => file.startsWith("tests/integration/"))).toBe(true);
    expect(defaultProfile.some((file) => file.startsWith("tests/unit/compaction/"))).toBe(true);
    expect(defaultProfile).toContain("tests/unit/compaction/compaction-flow.test.ts");
  });

  it("selects only the provisioned gateway harness in the infrastructure profile", async () => {
    const infraProfile = await selectedBy("vitest.infra.config.ts");

    expect(infraProfile.length).toBeGreaterThan(0);
    expect(infraProfile.every((file) => file.startsWith("tests/integration/mocks/"))).toBe(true);
  });
});
