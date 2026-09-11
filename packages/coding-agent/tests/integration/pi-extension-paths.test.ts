import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";

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

const { getExtensionPaths, getFirstPartyExtensionPaths } = await import(
  "../../src/runtime/pi-packages"
);

describe("first-party extension paths", () => {
  it("includes the subagent extension by default", () => {
    const paths = getExtensionPaths();
    expect(paths.some((p: string) => p.includes("extensions/subagent"))).toBe(true);
  });

  it("composes the default paths from the first-party inventory", () => {
    expect(getExtensionPaths()).toEqual(getFirstPartyExtensionPaths());
  });

  it("excludes the subagent extension when includeSubagentExtension is false", () => {
    const paths = getExtensionPaths({ includeSubagentExtension: false });
    expect(paths.some((p: string) => p.includes("extensions/subagent"))).toBe(false);
    expect(paths).toEqual(
      getFirstPartyExtensionPaths().filter(
        (p: string) => !p.includes("extensions/subagent"),
      ),
    );
  });

  it("first-party paths exist on disk", () => {
    const paths = getFirstPartyExtensionPaths();
    expect(paths.some((p: string) => p.includes("extensions/subagent"))).toBe(true);
    for (const p of paths) {
      expect(existsSync(p)).toBe(true);
    }
  });
});
