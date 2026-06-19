import { describe, it, expect } from "vitest";
import { summarizeToolCall } from "@/lib/features/code/tool-summary";

describe("summarizeToolCall", () => {
  it("returns the command for bash", () => {
    expect(summarizeToolCall("bash", { command: "ls -la" })).toBe("ls -la");
  });

  it("falls back to cmd for shell", () => {
    expect(summarizeToolCall("shell", { cmd: "echo hi" })).toBe("echo hi");
  });

  it("returns the path for read", () => {
    expect(summarizeToolCall("read", { path: "/foo/bar.ts" })).toBe(
      "/foo/bar.ts",
    );
  });

  it("returns the path for write and edit", () => {
    expect(summarizeToolCall("write", { path: "/a.ts" })).toBe("/a.ts");
    expect(summarizeToolCall("edit", { path: "/b.ts" })).toBe("/b.ts");
  });

  it("combines pattern and path for grep", () => {
    expect(summarizeToolCall("grep", { pattern: "TODO", path: "/src" })).toBe(
      "TODO in /src",
    );
  });

  it("returns the path for find and ls", () => {
    expect(summarizeToolCall("find", { path: "/usr" })).toBe("/usr");
    expect(summarizeToolCall("ls", { path: "/" })).toBe("/");
  });

  it("prefers pattern over path for find", () => {
    expect(summarizeToolCall("find", { pattern: "*.ts", path: "/src" })).toBe(
      "*.ts",
    );
  });

  it("truncates long strings with ellipsis", () => {
    const long = "x".repeat(200);
    expect(summarizeToolCall("bash", { command: long })).toBe(
      `${"x".repeat(80)}…`,
    );
  });

  it("falls back to JSON.stringify for unknown tools", () => {
    expect(summarizeToolCall("magic", { foo: 1 })).toBe('{"foo":1}');
  });

  it("handles missing args gracefully", () => {
    expect(summarizeToolCall("bash", undefined)).toBe("");
    expect(summarizeToolCall("read", null)).toBe("");
  });
});
