import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  captureGitFileState,
  diffTurnFiles,
  parsePorcelainStatusZ,
  statusFromXY,
  type GitFileState,
} from "../../src/turn-git-state";
import { clearInheritedGitRepositoryEnv } from "../helpers/git-env";

const execFileAsync = promisify(execFile);

describe("parsePorcelainStatusZ", () => {
  it("parses simple entries", () => {
    const output = " M src/a.ts\0?? new.txt\0D  gone.ts\0";
    expect(parsePorcelainStatusZ(output)).toEqual([
      { xy: " M", path: "src/a.ts" },
      { xy: "??", path: "new.txt" },
      { xy: "D ", path: "gone.ts" },
    ]);
  });

  it("consumes the original-path token of a rename record", () => {
    const output = "R  renamed.ts\0original.ts\0 M other.ts\0";
    expect(parsePorcelainStatusZ(output)).toEqual([
      { xy: "R ", path: "renamed.ts" },
      { xy: " M", path: "other.ts" },
    ]);
  });

  it("returns no entries for a clean tree", () => {
    expect(parsePorcelainStatusZ("")).toEqual([]);
  });
});

describe("statusFromXY", () => {
  it("maps porcelain codes to change statuses", () => {
    expect(statusFromXY("??")).toBe("untracked");
    expect(statusFromXY("R ")).toBe("renamed");
    expect(statusFromXY(" D")).toBe("deleted");
    expect(statusFromXY("A ")).toBe("added");
    expect(statusFromXY(" M")).toBe("modified");
    expect(statusFromXY("MM")).toBe("modified");
  });
});

describe("diffTurnFiles", () => {
  const entry = (xy: string, fingerprint: string) => ({ xy, fingerprint });

  it("reports files that are newly dirty or whose fingerprint changed", () => {
    const before: GitFileState = new Map([
      ["unchanged.ts", entry(" M", " M:10:1")],
      ["retouched.ts", entry(" M", " M:20:1")],
    ]);
    const after: GitFileState = new Map([
      ["unchanged.ts", entry(" M", " M:10:1")],
      ["retouched.ts", entry(" M", " M:25:2")],
      ["fresh.ts", entry("??", "??:5:3")],
    ]);
    expect(diffTurnFiles(before, after)).toEqual([
      { path: "fresh.ts", status: "untracked" },
      { path: "retouched.ts", status: "modified" },
    ]);
  });

  it("skips files that left the dirty set during the turn", () => {
    const before: GitFileState = new Map([
      ["committed.ts", entry(" M", " M:10:1")],
    ]);
    expect(diffTurnFiles(before, new Map())).toEqual([]);
  });

  it("reports everything when there was no baseline entry", () => {
    const after: GitFileState = new Map([["a.ts", entry(" M", " M:1:1")]]);
    expect(diffTurnFiles(new Map(), after)).toEqual([
      { path: "a.ts", status: "modified" },
    ]);
  });

  it("returns nothing when the after capture is unavailable", () => {
    expect(diffTurnFiles(new Map(), null)).toEqual([]);
  });
});

describe("captureGitFileState (integration)", () => {
  let root: string;
  let repo: string;
  let restoreGitEnv: () => void;

  const git = (args: string[]) =>
    execFileAsync("git", args, { cwd: repo });

  beforeAll(async () => {
    restoreGitEnv = clearInheritedGitRepositoryEnv();
    root = await mkdtemp(join(tmpdir(), "turn-git-state-"));
    repo = join(root, "repo");
    await mkdir(repo);
    await execFileAsync("git", ["init", "-q"], { cwd: repo });
    await git(["config", "user.email", "test@test.local"]);
    await git(["config", "user.name", "Test"]);
    await writeFile(join(repo, "tracked.txt"), "original\n");
    await git(["add", "."]);
    await git(["commit", "-q", "-m", "init"]);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
    restoreGitEnv();
  });

  it("returns null outside a git work tree", async () => {
    const outside = join(root, "not-a-repo");
    await mkdir(outside, { recursive: true });
    expect(await captureGitFileState(outside)).toBeNull();
  });

  it("captures dirty files and diffs turn edits", async () => {
    const before = await captureGitFileState(repo);
    expect(before).not.toBeNull();
    expect(before!.size).toBe(0);

    await writeFile(join(repo, "tracked.txt"), "edited by the agent\n");
    await writeFile(join(repo, "brand-new.txt"), "hello\n");

    const after = await captureGitFileState(repo);
    expect(diffTurnFiles(before, after)).toEqual([
      { path: "brand-new.txt", status: "untracked" },
      { path: "tracked.txt", status: "modified" },
    ]);
  });
});
