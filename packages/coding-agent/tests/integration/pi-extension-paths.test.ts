import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { basename, dirname } from "node:path";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  getTraceLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { getExtensionPaths, getFirstPartyExtensionPaths, getPiPackageExtensionPaths } =
  await import("../../src/runtime/pi-packages");

describe("first-party extension paths", () => {
  it("includes the artifacts and subagent extensions by default", () => {
    const paths = getExtensionPaths();
    expect(paths.some((p: string) => p.includes("extensions/subagent"))).toBe(true);
    expect(paths.map((p: string) => basename(dirname(p)))).toEqual([
      "artifacts",
      "subagent",
    ]);
  });

  it("composes the default paths from the first-party inventory", () => {
    expect(getExtensionPaths()).toEqual(getFirstPartyExtensionPaths());
    expect(getExtensionPaths()).toEqual([
      ...getPiPackageExtensionPaths(),
      ...getFirstPartyExtensionPaths(),
    ]);
  });

  it("excludes the subagent extension when includeSubagentExtension is false", () => {
    const paths = getExtensionPaths({ includeSubagentExtension: false });
    expect(paths.some((p: string) => p.includes("extensions/subagent"))).toBe(false);
    expect(paths).toEqual(
      getFirstPartyExtensionPaths().filter(
        (p: string) => !p.includes("extensions/subagent"),
      ),
    );
    expect(paths.map((p: string) => basename(dirname(p)))).toEqual(["artifacts"]);
  });

  it("first-party paths exist on disk", () => {
    const paths = getFirstPartyExtensionPaths();
    expect(paths.some((p: string) => p.includes("extensions/subagent"))).toBe(true);
    for (const p of paths) {
      expect(existsSync(p)).toBe(true);
    }
  });
});
