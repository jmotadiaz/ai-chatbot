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
  getExtensionPaths,
  getFirstPartyExtensionPaths,
  getPiPackageExtensionPaths,
  getPiPackagePath,
  type PiPackage,
} from "../../src/pi-packages";
import { PACKAGE_ROOT } from "../../src/paths";
import { USING_SUPERPOWERS_PROMPT } from "../../extensions/superpowers/using-superpowers";

describe("first-party extension discovery", () => {
  it("discovers all first-party extensions including superpowers and subagent", () => {
    const paths = getFirstPartyExtensionPaths();
    expect(paths.some((p) => p.endsWith("extensions/superpowers"))).toBe(true);
    expect(paths.some((p) => p.endsWith("extensions/subagent"))).toBe(true);
  });

  it("includes all first-party extensions by default in getExtensionPaths", () => {
    const paths = getExtensionPaths();
    expect(paths.some((p) => p.endsWith("extensions/superpowers"))).toBe(true);
    expect(paths.some((p) => p.endsWith("extensions/subagent"))).toBe(true);
  });

  it("excludes subagent when includeSubagentExtension is false", () => {
    const paths = getExtensionPaths({ includeSubagentExtension: false });
    expect(paths.some((p) => p.endsWith("extensions/superpowers"))).toBe(true);
    expect(paths.some((p) => p.endsWith("extensions/subagent"))).toBe(false);
  });

  it("excludes superpowers when includeSuperpowersExtension is false", () => {
    const paths = getExtensionPaths({ includeSuperpowersExtension: false });
    expect(paths.some((p) => p.endsWith("extensions/superpowers"))).toBe(false);
    expect(paths.some((p) => p.endsWith("extensions/subagent"))).toBe(true);
  });
});

describe("superpowers first-party extension integration", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), `superpowers-ext-test-${crypto.randomUUID()}`);
    mkdirSync(tmpRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("binds resources_discover and loads superpowers skills including customized brainstorming", async () => {
    const agentDir = join(tmpRoot, "agent");
    const cwd = join(tmpRoot, "project");
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(cwd, { recursive: true });

    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      additionalExtensionPaths: getExtensionPaths({
        includeSubagentExtension: false,
      }),
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

    const loadedSkills = resourceLoader.getSkills().skills;
    const brainstorming = loadedSkills.find((s) => s.name === "brainstorming");
    expect(brainstorming).toBeDefined();
    expect(brainstorming?.filePath).toMatch(
      /packages[/\\]coding-agent[/\\]extensions[/\\]superpowers[/\\]skills[/\\]brainstorming[/\\]SKILL\.md$/,
    );

    // Verify key skills exist
    const skillNames = loadedSkills.map((s) => s.name);
    expect(skillNames).toContain("writing-plans");
    expect(skillNames).toContain("test-driven-development");
    expect(skillNames).toContain("systematic-debugging");

    // using-superpowers is no longer a discoverable skill: it was extracted
    // from skills/ and embedded as a system-prompt bootstrap (see
    // extensions/superpowers/using-superpowers.ts).
    expect(skillNames).not.toContain("using-superpowers");

    session.dispose();
  });

  it("loads no superpowers skills for subagent runtimes", async () => {
    const agentDir = join(tmpRoot, "agent-subagent");
    const cwd = join(tmpRoot, "project-subagent");
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(cwd, { recursive: true });

    // Subagent runtimes are built with includeSubagentExtension: false; the
    // superpowers extension must not be loaded at all (skills + bootstrap
    // belong to the orchestrating agent only).
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      additionalExtensionPaths: getExtensionPaths({
        includeSubagentExtension: false,
        includeSuperpowersExtension: false,
      }),
    });
    await resourceLoader.reload();

    const skillNames = resourceLoader.getSkills().skills.map((s) => s.name);
    expect(skillNames).not.toContain("brainstorming");
    expect(skillNames).not.toContain("test-driven-development");
    expect(skillNames).not.toContain("systematic-debugging");
  });
});

describe("using-superpowers embedded bootstrap", () => {
  it("exposes the full bootstrap content without skill front matter", () => {
    expect(USING_SUPERPOWERS_PROMPT).toContain("You have superpowers.");
    expect(USING_SUPERPOWERS_PROMPT).toContain("<EXTREMELY-IMPORTANT>");
    expect(USING_SUPERPOWERS_PROMPT).toContain("## The Rule");
    expect(USING_SUPERPOWERS_PROMPT).toContain("## Red Flags");
    expect(USING_SUPERPOWERS_PROMPT).toContain("## Platform Adaptation");
    expect(USING_SUPERPOWERS_PROMPT).toContain("## User Instructions");

    // Front matter (name/description), per-harness reference files, and the
    // <SUBAGENT-STOP> block are not part of the embedded content: the front
    // matter and references belong to the skill packaging, and subagent
    // sessions are excluded structurally by the harness, not by text.
    expect(USING_SUPERPOWERS_PROMPT).not.toContain(
      "description: Use when starting any conversation",
    );
    expect(USING_SUPERPOWERS_PROMPT).not.toContain("references/codex-tools.md");
    expect(USING_SUPERPOWERS_PROMPT).not.toContain("<SUBAGENT-STOP>");

    // The skill directory must not exist anymore (extracted from skills/).
    expect(
      existsSync(
        join(PACKAGE_ROOT, "extensions", "superpowers", "skills", "using-superpowers"),
      ),
    ).toBe(false);
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
