import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizePath,
  packagePath,
  REPO_ROOT,
  repoPath,
  resolvePath,
} from "../../src/paths";

/**
 * Portable path resolution (ADR 0011 §3.3): the root is discovered from
 * `import.meta.url`, the host's home is never hardcoded.
 */
describe("REPO_ROOT", () => {
  it("points at the real monorepo root", () => {
    expect(REPO_ROOT.startsWith("/")).toBe(true);
    expect(existsSync(path.join(REPO_ROOT, "pnpm-workspace.yaml"))).toBe(true);
    expect(existsSync(path.join(REPO_ROOT, "package.json"))).toBe(true);
  });

  it("resolves repoPath against the root and packagePath against packages/<pkg>", () => {
    expect(repoPath("packages", "config")).toBe(path.join(REPO_ROOT, "packages", "config"));
    expect(packagePath("chatbot", "next.config.ts")).toBe(
      path.join(REPO_ROOT, "packages", "chatbot", "next.config.ts"),
    );
    expect(existsSync(packagePath("config", "src", "paths.ts"))).toBe(true);
  });

  it("contains no absolute host home paths in the versioned configuration", () => {
    expect(packagePath("config", "src", "config.prod.ts").startsWith(REPO_ROOT)).toBe(true);
  });
});

describe("normalizePath / resolvePath (isomorphic, without node:path)", () => {
  it("collapses separators and relative segments", () => {
    expect(normalizePath("/a//b/./c")).toBe("/a/b/c");
    expect(normalizePath("/a/b/../c")).toBe("/a/c");
    expect(normalizePath("/a/b/../../..")).toBe("/");
  });

  it("an absolute segment restarts resolution (like path.resolve)", () => {
    expect(resolvePath("/root", "a", "/abs", "b")).toBe("/abs/b");
    expect(resolvePath("/root", "packages", "config")).toBe("/root/packages/config");
  });

  it("relative segments are not wrongly turned into absolute ones", () => {
    expect(resolvePath(".")).toBe(".");
    expect(resolvePath(".", "packages")).toBe("packages");
    expect(resolvePath("a", "b", "c")).toBe("a/b/c");
  });
});
