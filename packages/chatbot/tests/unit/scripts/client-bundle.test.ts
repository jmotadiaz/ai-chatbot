import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  inspectClientBundle,
  loadSecretLiterals,
  verifyClientBundle,
  type BuildOutcome,
} from "../../../scripts/client-bundle";

const PACKAGE_ROOT = path.resolve(__dirname, "../../..");
const SECRET = "super-secret-prod-dsn-value";
const T = 1_800_000_000_000;
const PAST = (T - 60_000) / 1000;
const FUTURE = (T + 1_000) / 1000;

let root: string;
let staticDir: string;

function writeChunk(name: string, content: string, mtimeSeconds?: number) {
  const file = path.join(staticDir, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  if (mtimeSeconds !== undefined) utimesSync(file, mtimeSeconds, mtimeSeconds);
  return file;
}

beforeEach(() => {
  mkdirSync(path.join(PACKAGE_ROOT, ".next"), { recursive: true });
  root = mkdtempSync(path.join(PACKAGE_ROOT, ".next", "client-bundle-test-"));
  staticDir = path.join(root, "static");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("inspectClientBundle", () => {
  it("reports missing when the static directory does not exist", () => {
    expect(inspectClientBundle({ staticDir, secretLiterals: [SECRET] })).toEqual({
      status: "missing",
      staticDir,
    });
  });

  it("reports missing when the directory holds no JavaScript chunks", () => {
    writeChunk("readme.txt", "no js here");
    expect(inspectClientBundle({ staticDir, secretLiterals: [SECRET] }).status).toBe("missing");
  });

  it("rejects a stale bundle when freshness is required, even if clean", () => {
    writeChunk("app.js", "clean", PAST);
    const result = inspectClientBundle({ staticDir, secretLiterals: [SECRET], freshSince: T });
    expect(result).toMatchObject({ status: "stale", staleFiles: ["app.js"], freshSince: T });
  });

  it("inspects a stale bundle without freshness when none is required", () => {
    writeChunk("app.js", "clean", PAST);
    expect(inspectClientBundle({ staticDir, secretLiterals: [SECRET] })).toMatchObject({
      status: "inspected",
      filesInspected: 1,
      freshnessChecked: false,
    });
  });

  it("passes a fresh clean bundle and counts every chunk it actually read", () => {
    writeChunk("a.js", "clean", FUTURE);
    writeChunk("nested/b.js", "also clean", FUTURE);
    expect(
      inspectClientBundle({ staticDir, secretLiterals: [SECRET, "other"], freshSince: T }),
    ).toEqual({
      status: "inspected",
      staticDir,
      filesInspected: 2,
      literalsChecked: 2,
      freshnessChecked: true,
    });
  });

  it("detects a secret literal inside a fresh chunk", () => {
    writeChunk("leak.js", `const dsn = "${SECRET}";`, FUTURE);
    const result = inspectClientBundle({ staticDir, secretLiterals: [SECRET], freshSince: T });
    expect(result).toMatchObject({
      status: "leaks",
      filesInspected: 1,
      leaks: [{ file: "leak.js" }],
    });
  });
});

describe("loadSecretLiterals", () => {
  it("returns only hardcoded literals when the prod secrets module is absent", () => {
    const literals = loadSecretLiterals(path.join(root, "missing.ts"));
    expect(literals).toContain("5435/prod");
    expect(literals).toHaveLength(2);
  });

  it("extracts long quoted values from the prod secrets module", () => {
    const secretsPath = path.join(root, "secrets.prod.ts");
    writeFileSync(secretsPath, `export const s = { dsn: "${SECRET}", short: "abc" };`);
    const literals = loadSecretLiterals(secretsPath);
    expect(literals).toContain(SECRET);
    expect(literals).not.toContain("abc");
  });
});

describe("verifyClientBundle", () => {
  const logs = (): { log: (line: string) => void; lines: string[] } => {
    const lines: string[] = [];
    return { lines, log: (line) => lines.push(line) };
  };
  const build = (ok: boolean, produce?: () => void): (() => BuildOutcome) => {
    return () => {
      produce?.();
      return { ok, detail: ok ? "exit 0" : "exit 1" };
    };
  };

  describe("fast mode", () => {
    it("reports NOT INSPECTED and never claims success when the artifact is absent", () => {
      const { log, lines } = logs();
      const code = verifyClientBundle({
        mode: "fast",
        staticDir,
        secretLiterals: [SECRET],
        runBuild: build(true),
        log,
      });
      expect(code).toBe(0);
      expect(lines.join("\n")).toContain("NOT INSPECTED");
      expect(lines.join("\n")).not.toContain("OK:");
    });

    it("fails when the existing artifact leaks a secret", () => {
      writeChunk("leak.js", SECRET);
      const { log } = logs();
      expect(
        verifyClientBundle({ mode: "fast", staticDir, secretLiterals: [SECRET], runBuild: build(true), log }),
      ).toBe(1);
    });

    it("never runs the build", () => {
      let built = false;
      verifyClientBundle({
        mode: "fast",
        staticDir,
        secretLiterals: [SECRET],
        runBuild: () => {
          built = true;
          return { ok: true, detail: "" };
        },
        log: () => {},
      });
      expect(built).toBe(false);
    });
  });

  describe("full mode", () => {
    const run = (runBuild: () => BuildOutcome) => {
      const { log, lines } = logs();
      const code = verifyClientBundle({
        mode: "full",
        staticDir,
        secretLiterals: [SECRET],
        runBuild,
        now: () => T,
        log,
      });
      return { code, output: lines.join("\n") };
    };

    it("fails without inspecting when build:verify fails, even if a clean artifact exists", () => {
      writeChunk("app.js", "clean", FUTURE);
      const { code, output } = run(build(false));
      expect(code).toBe(1);
      expect(output).toContain("bundle not inspected");
      expect(output).not.toContain("OK:");
    });

    it("fails when the build succeeds but leaves no artifact", () => {
      const { code, output } = run(build(true));
      expect(code).toBe(1);
      expect(output).toContain("no client bundle produced");
    });

    it("fails when the build succeeds but only a stale artifact remains", () => {
      writeChunk("old.js", "clean", PAST);
      const { code, output } = run(build(true));
      expect(code).toBe(1);
      expect(output).toContain("predate the build");
    });

    it("inspects the freshly built output and fails on a leak inside it", () => {
      const { code, output } = run(
        build(true, () => writeChunk("leak.js", `x="${SECRET}"`, FUTURE)),
      );
      expect(code).toBe(1);
      expect(output).toContain("LEAK");
    });

    it("passes when the freshly built output is clean and reports what it inspected", () => {
      const { code, output } = run(build(true, () => writeChunk("app.js", "clean", FUTURE)));
      expect(code).toBe(0);
      expect(output).toContain("1 chunk(s) inspected");
      expect(output).toContain("newer than the build start");
    });

    it("propagates an unexpected error thrown by the build", () => {
      expect(() =>
        run(() => {
          throw new Error("spawn exploded");
        }),
      ).toThrow("spawn exploded");
    });

    it("ignores a stale artifact that is present before the build but rewritten by it", () => {
      writeChunk("app.js", "clean", PAST);
      const { code } = run(build(true, () => writeChunk("app.js", "clean", FUTURE)));
      expect(code).toBe(0);
      expect(existsSync(path.join(staticDir, "app.js"))).toBe(true);
    });
  });
});
