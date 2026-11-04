import { describe, expect, it } from "vitest";
import { toPageUrl } from "@/scripts/check-mobile";

describe("toPageUrl", () => {
  it("passes http/https/file URLs through unchanged", () => {
    expect(toPageUrl("http://localhost:3000/x")).toBe("http://localhost:3000/x");
    expect(toPageUrl("https://example.com/a.html")).toBe("https://example.com/a.html");
    expect(toPageUrl("file:///tmp/a.html")).toBe("file:///tmp/a.html");
  });

  it("converts a local path to a file:// URL", () => {
    const out = toPageUrl("/tmp/a.html");
    expect(out).toMatch(/^file:\/\//);
    expect(out).toContain("a.html");
  });

  it("resolves relative paths", () => {
    const out = toPageUrl("relative.html");
    expect(out).toMatch(/^file:\/\//);
  });
});
