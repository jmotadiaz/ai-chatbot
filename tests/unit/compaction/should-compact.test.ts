import { describe, it, expect } from "vitest";
import { shouldCompact } from "@/lib/features/compaction/should-compact";
import type { CompactionSettings } from "@/lib/features/compaction/types";

const defaultSettings: CompactionSettings = {
  keepRecentTokens: 20000,
  reserveTokens: 16384,
  enabled: true,
};

describe("shouldCompact", () => {
  it("returns true when context tokens exceed window minus reserve", () => {
    expect(shouldCompact(200_000, 128_000, defaultSettings)).toBe(true);
  });

  it("returns false when context tokens are within window minus reserve", () => {
    expect(shouldCompact(50_000, 128_000, defaultSettings)).toBe(false);
  });

  it("returns false when exactly at the boundary", () => {
    const contextWindow = 128_000;
    const boundary = contextWindow - defaultSettings.reserveTokens;
    expect(shouldCompact(boundary, contextWindow, defaultSettings)).toBe(false);
  });

  it("returns false when compaction is disabled", () => {
    const disabled: CompactionSettings = { ...defaultSettings, enabled: false };
    expect(shouldCompact(200_000, 128_000, disabled)).toBe(false);
  });

  it("returns true when tokens equal boundary + 1", () => {
    const contextWindow = 128_000;
    const boundary = contextWindow - defaultSettings.reserveTokens;
    expect(shouldCompact(boundary + 1, contextWindow, defaultSettings)).toBe(true);
  });
});
