import { describe, it, expect, vi } from "vitest";

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
  "coding-agent/pi-packages"
);

describe("first-party extension paths", () => {
  it("includes the subagent extension dir by default", () => {
    const paths = getExtensionPaths();
    expect(paths.some((p: string) => p.endsWith("extensions/subagent"))).toBe(true);
  });

  it("excludes the subagent extension when includeSubagentExtension is false", () => {
    const paths = getExtensionPaths({ includeSubagentExtension: false });
    expect(paths.some((p: string) => p.endsWith("extensions/subagent"))).toBe(false);
  });

  it("first-party paths exist on disk", () => {
    for (const p of getFirstPartyExtensionPaths()) {
      expect(p).toMatch(/extensions\/subagent$/);
    }
  });
});
