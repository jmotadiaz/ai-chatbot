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
  "../../src/pi-packages"
);

describe("first-party extension paths", () => {
  it("includes subagent and superpowers extension dirs by default", () => {
    const paths = getExtensionPaths();
    expect(paths.some((p: string) => p.endsWith("extensions/subagent"))).toBe(true);
    expect(paths.some((p: string) => p.endsWith("extensions/superpowers"))).toBe(true);
  });

  it("excludes the subagent extension when includeSubagentExtension is false", () => {
    const paths = getExtensionPaths({ includeSubagentExtension: false });
    expect(paths.some((p: string) => p.endsWith("extensions/subagent"))).toBe(false);
    expect(paths.some((p: string) => p.endsWith("extensions/superpowers"))).toBe(true);
  });

  it("excludes superpowers when includeSuperpowersExtension is false (subagent runtimes)", () => {
    const paths = getExtensionPaths({
      includeSubagentExtension: false,
      includeSuperpowersExtension: false,
    });
    expect(paths.some((p: string) => p.endsWith("extensions/subagent"))).toBe(false);
    expect(paths.some((p: string) => p.endsWith("extensions/superpowers"))).toBe(false);
  });

  it("first-party paths exist on disk", () => {
    const paths = getFirstPartyExtensionPaths();
    expect(paths.length).toBeGreaterThanOrEqual(2);
    for (const p of paths) {
      expect(existsSync(p)).toBe(true);
    }
  });
});
