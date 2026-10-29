import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createVitest } from "vitest/node";

// Contract for the test taxonomy and the execution profiles (ADR 0013, ticket
// 15): the chatbot has one test CATEGORY — unit tests organized by capability
// under `tests/unit/` — next to the Playwright E2E suite. Contract checks and
// rendered-component tests without a real browser are unit tests, so the
// historical `component`, `integration` and `contract` directories must not
// come back. Execution profiles (default vs. provisioned infrastructure) change
// how tests run, never where they live. Playwright files under `tests/e2e` are
// outside Vitest and excluded from the file inventory.
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

describe("test layout and execution profile selection", () => {
  it("keeps only the unit category next to the Playwright E2E suite", () => {
    const categories = readdirSync(path.join(PACKAGE_ROOT, "tests"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    // `helpers` and `mocks` are shared support code, not test categories.
    expect(categories).toEqual(["e2e", "helpers", "mocks", "unit"]);
  });

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

  it("selects every unit capability in the default profile except the provisioned tests", async () => {
    const defaultProfile = await selectedBy("vitest.config.ts");

    expect(defaultProfile.length).toBeGreaterThan(0);
    expect(defaultProfile.every((file) => file.startsWith("tests/unit/"))).toBe(true);
    expect(defaultProfile).toContain("tests/unit/compaction/compaction-flow.test.ts");
    expect(defaultProfile).not.toContain("tests/unit/mocks/gateway/gateway.test.ts");
  });

  it("selects only the provisioned gateway harness in the infrastructure profile", async () => {
    const infraProfile = await selectedBy("vitest.infra.config.ts");

    expect(infraProfile).toEqual(["tests/unit/mocks/gateway/gateway.test.ts"]);
  });
});
