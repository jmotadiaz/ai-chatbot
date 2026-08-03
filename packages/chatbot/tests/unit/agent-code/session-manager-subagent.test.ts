import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
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

const { resolveSubagentCwd, resolveSubagentModelId, ensureSubagentSessionsDir } =
  await import("coding-agent/session-manager");

describe("ensureSubagentSessionsDir", () => {
  it("creates the subagents dir when it is missing", () => {
    const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-sessions-"));
    const dir = ensureSubagentSessionsDir(sessionsDir);
    expect(dir).toBe(path.join(sessionsDir, "subagents"));
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it("leaves an existing dir untouched", () => {
    const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-sessions-"));
    const dir = path.join(sessionsDir, "subagents");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "existing.jsonl"), "{}\n");

    expect(ensureSubagentSessionsDir(sessionsDir)).toBe(dir);
    expect(fs.readdirSync(dir)).toEqual(["existing.jsonl"]);
  });
});

describe("resolveSubagentCwd", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-cwd-"));
  it("defaults to the parent cwd", () => {
    expect(resolveSubagentCwd(root)).toEqual({ ok: true, cwd: root });
  });
  it("accepts an existing directory inside the project", () => {
    const wt = path.join(root, ".worktrees", "feat-x");
    fs.mkdirSync(wt, { recursive: true });
    expect(resolveSubagentCwd(root, ".worktrees/feat-x")).toEqual({ ok: true, cwd: wt });
  });
  it("rejects paths outside the project root", () => {
    const r = resolveSubagentCwd(root, "..");
    expect(r.ok).toBe(false);
  });
  it("rejects non-existent directories", () => {
    const r = resolveSubagentCwd(root, "nope");
    expect(r.ok).toBe(false);
  });
});

describe("resolveSubagentModelId", () => {
  const available = ["opencode-go/kimi-k2", "opencode-go/glm-4.6"];
  it("inherits the parent model when no param", () => {
    expect(resolveSubagentModelId({ provider: "p", id: "m" }, available)).toEqual({ ok: true, modelId: "p/m" });
  });
  it("accepts a strict match", () => {
    expect(resolveSubagentModelId(undefined, available, "opencode-go/kimi-k2")).toEqual({ ok: true, modelId: "opencode-go/kimi-k2" });
  });
  it("rejects non-matching values with the full list in the error", () => {
    const r = resolveSubagentModelId(undefined, available, "kimi");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("kimi");
      expect(r.error).toContain("opencode-go/kimi-k2");
      expect(r.error).toContain("opencode-go/glm-4.6");
    }
  });
});
