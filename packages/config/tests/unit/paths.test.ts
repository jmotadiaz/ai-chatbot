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
 * Resolución portable de rutas (ADR 0011 §3.3): la raíz se descubre desde
 * `import.meta.url`, nunca se hardcodea el home del host.
 */
describe("REPO_ROOT", () => {
  it("apunta a la raíz real del monorepo", () => {
    expect(REPO_ROOT.startsWith("/")).toBe(true);
    expect(existsSync(path.join(REPO_ROOT, "pnpm-workspace.yaml"))).toBe(true);
    expect(existsSync(path.join(REPO_ROOT, "package.json"))).toBe(true);
  });

  it("resuelve repoPath contra la raíz y packagePath contra packages/<pkg>", () => {
    expect(repoPath("packages", "config")).toBe(path.join(REPO_ROOT, "packages", "config"));
    expect(packagePath("chatbot", "next.config.ts")).toBe(
      path.join(REPO_ROOT, "packages", "chatbot", "next.config.ts"),
    );
    expect(existsSync(packagePath("config", "src", "paths.ts"))).toBe(true);
  });

  it("no contiene rutas absolutas del home del host en la configuración versionada", () => {
    expect(packagePath("config", "src", "config.prod.ts").startsWith(REPO_ROOT)).toBe(true);
  });
});

describe("normalizePath / resolvePath (isomorfos, sin node:path)", () => {
  it("colapsa separadores y segmentos relativos", () => {
    expect(normalizePath("/a//b/./c")).toBe("/a/b/c");
    expect(normalizePath("/a/b/../c")).toBe("/a/c");
    expect(normalizePath("/a/b/../../..")).toBe("/");
  });

  it("un segmento absoluto reinicia la resolución (como path.resolve)", () => {
    expect(resolvePath("/root", "a", "/abs", "b")).toBe("/abs/b");
    expect(resolvePath("/root", "packages", "config")).toBe("/root/packages/config");
  });

  it("segmentos relativos no se convierten erróneamente en absolutos", () => {
    expect(resolvePath(".")).toBe(".");
    expect(resolvePath(".", "packages")).toBe("packages");
    expect(resolvePath("a", "b", "c")).toBe("a/b/c");
  });
});
