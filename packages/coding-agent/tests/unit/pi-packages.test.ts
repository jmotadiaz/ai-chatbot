import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
  BUILTIN_SKILLS_DIR,
  getBuiltinSkillPaths,
  getExtensionPaths,
  getFirstPartyExtensionPaths,
  getFirstPartySkillPaths,
  getPiPackageExtensionPaths,
  getPiPackagePath,
  type PiPackage,
} from "../../src/runtime/pi-packages";

describe("first-party extension and built-in skills discovery", () => {
  it("discovers first-party extension entrypoints as files", () => {
    const paths = getFirstPartyExtensionPaths();
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.includes("extensions/subagent"))).toBe(true);
    // Entrypoints are files, not dirs
    expect(paths.every((p) => p.endsWith("index.ts"))).toBe(true);
    for (const p of paths) {
      expect(existsSync(p)).toBe(true);
    }
  });

  it("includes every first-party extension by default in getExtensionPaths", () => {
    expect(getExtensionPaths()).toEqual(getFirstPartyExtensionPaths());
  });

  it("excludes subagent when includeSubagentExtension is false", () => {
    const paths = getExtensionPaths({ includeSubagentExtension: false });
    expect(paths.some((p) => p.includes("extensions/subagent"))).toBe(false);
    expect(paths).toEqual(
      getFirstPartyExtensionPaths().filter((p) => !p.includes("extensions/subagent")),
    );
  });

  it("has no first-party skill dirs", () => {
    expect(getFirstPartySkillPaths()).toEqual([]);
  });

  it("discovers built-in skills directory and writing-prompties skill", () => {
    const builtinPaths = getBuiltinSkillPaths();
    expect(builtinPaths).toEqual([BUILTIN_SKILLS_DIR]);
    expect(existsSync(join(BUILTIN_SKILLS_DIR, "writing-prompties", "SKILL.md"))).toBe(true);
  });
});

describe("subagent runtime resource loading", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), `subagent-resources-test-${crypto.randomUUID()}`);
    mkdirSync(tmpRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("loads exactly the built-in skills and no subagent extension", async () => {
    const agentDir = join(tmpRoot, "agent");
    const cwd = join(tmpRoot, "project");
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(cwd, { recursive: true });

    // Subagent runtimes are built with includeSubagentExtension: false, so the
    // orchestrator's `subagent` tool never reaches a child. Skills come only
    // from the built-in directory; there are no first-party skill dirs left.
    // `noSkills: true` drops machine-global (user-installed) skills so the
    // assertion covers the harness-owned composition, not this host's setup.
    const extensionPaths = getExtensionPaths({ includeSubagentExtension: false });
    const skillPaths = [...getBuiltinSkillPaths(), ...getFirstPartySkillPaths()];

    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      noSkills: true,
      additionalExtensionPaths: extensionPaths,
      additionalSkillPaths: skillPaths,
    });
    await resourceLoader.reload();
    const { session } = await createAgentSession({
      cwd,
      agentDir,
      resourceLoader,
      sessionManager: SessionManager.inMemory(cwd),
      noTools: "all",
    });

    await session.bindExtensions({ mode: "rpc" });

    const skillNames = resourceLoader
      .getSkills()
      .skills.map((s) => s.name)
      .sort();
    expect(skillNames).toEqual(["mobile-first-artifacts", "writing-prompties"]);
    expect(skillPaths).toEqual(getBuiltinSkillPaths());
    expect(extensionPaths.some((p) => p.includes("extensions/subagent"))).toBe(false);

    session.dispose();
  });
});

describe("Pi package extension entrypoints (generic helper)", () => {
  const dummyPkg: PiPackage = {
    name: "dummy-pkg",
    repo: "https://example.com/dummy.git",
    defaultRef: "v1.0.0",
    refEnvVar: "CODING_AGENT_DUMMY_REF",
    extensionEntrypoints: [".pi/extensions/dummy.ts"],
  };
  let tmpRoot: string;
  let originalPackagesDir: string | undefined;
  let manifestPath: string;
  let extensionPath: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), `pkg-paths-test-${crypto.randomUUID()}`);
    originalPackagesDir = process.env.CODING_AGENT_PI_PACKAGES_DIR;
    process.env.CODING_AGENT_PI_PACKAGES_DIR = tmpRoot;

    const checkout = getPiPackagePath(dummyPkg);
    manifestPath = join(checkout, "package.json");
    extensionPath = join(checkout, ".pi", "extensions", "dummy.ts");
    mkdirSync(dirname(extensionPath), { recursive: true });
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          name: "dummy-pkg",
          pi: {
            extensions: ["./.pi/extensions/dummy.ts"],
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(extensionPath, "export default function () {}\n");
  });

  afterEach(() => {
    if (originalPackagesDir === undefined) {
      delete process.env.CODING_AGENT_PI_PACKAGES_DIR;
    } else {
      process.env.CODING_AGENT_PI_PACKAGES_DIR = originalPackagesDir;
    }
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("handles package extension discovery when packages are defined", () => {
    expect(readFileSync(manifestPath, "utf-8")).toContain("dummy-pkg");
    expect(getPiPackageExtensionPaths()).toEqual([]);
  });
});
