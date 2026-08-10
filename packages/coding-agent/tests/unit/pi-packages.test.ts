import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
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
  loadSkills,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
  PI_PACKAGES,
  getExtensionPaths,
  getPiPackageExtensionPaths,
  getPiPackagePath,
} from "../../src/pi-packages";

describe("override skill precedence (SDK assumption)", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), `skill-order-test-${crypto.randomUUID()}`);
    mkdirSync(tmpRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  const writeSkill = (dir: string, body: string) => {
    mkdirSync(join(dir, "brainstorming"), { recursive: true });
    writeFileSync(
      join(dir, "brainstorming", "SKILL.md"),
      `---\nname: brainstorming\ndescription: ${body}\n---\n${body} BODY`,
    );
  };

  it("loadSkills keeps the first skill that claims a name", () => {
    const overrideDir = join(tmpRoot, "skills-override");
    const packageSkillsDir = join(tmpRoot, "package-skills");
    writeSkill(overrideDir, "override");
    writeSkill(packageSkillsDir, "original");

    const result = loadSkills({
      cwd: tmpRoot,
      agentDir: tmpRoot,
      skillPaths: [overrideDir, packageSkillsDir],
      includeDefaults: false,
    });

    expect(result.skills.find((skill) => skill.name === "brainstorming")?.filePath)
      .toBe(join(overrideDir, "brainstorming", "SKILL.md"));
  });
});

describe("Pi package extension entrypoints", () => {
  const superpowersPkg = PI_PACKAGES.find((pkg) => pkg.name === "superpowers")!;
  let tmpRoot: string;
  let originalPackagesDir: string | undefined;
  let manifestPath: string;
  let extensionPath: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), `extension-paths-test-${crypto.randomUUID()}`);
    originalPackagesDir = process.env.CODING_AGENT_PI_PACKAGES_DIR;
    process.env.CODING_AGENT_PI_PACKAGES_DIR = tmpRoot;

    const checkout = getPiPackagePath(superpowersPkg);
    manifestPath = join(checkout, "package.json");
    extensionPath = join(checkout, ".pi", "extensions", "superpowers.ts");
    mkdirSync(dirname(extensionPath), { recursive: true });
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          name: "superpowers",
          pi: {
            extensions: ["./.pi/extensions/superpowers.ts"],
            skills: ["./skills"],
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

  it("loads only configured extension files and leaves the upstream manifest untouched", () => {
    const originalManifest = readFileSync(manifestPath, "utf-8");

    expect(getPiPackageExtensionPaths()).toEqual([extensionPath]);
    expect(getExtensionPaths()).toContain(extensionPath);
    expect(getExtensionPaths()).not.toContain(getPiPackagePath(superpowersPkg));
    expect(readFileSync(manifestPath, "utf-8")).toBe(originalManifest);
  });

  it("skips a missing extension entrypoint", () => {
    rmSync(extensionPath);
    expect(getPiPackageExtensionPaths()).toEqual([]);
  });
});

describe("extension resource integration", () => {
  const superpowersPkg = PI_PACKAGES.find((pkg) => pkg.name === "superpowers")!;
  let tmpRoot: string;
  let originalPackagesDir: string | undefined;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), `extension-integration-test-${crypto.randomUUID()}`);
    originalPackagesDir = process.env.CODING_AGENT_PI_PACKAGES_DIR;
    process.env.CODING_AGENT_PI_PACKAGES_DIR = tmpRoot;

    const checkout = getPiPackagePath(superpowersPkg);
    const skillDir = join(checkout, "skills", "brainstorming");
    const extensionPath = join(checkout, ".pi", "extensions", "superpowers.ts");
    mkdirSync(skillDir, { recursive: true });
    mkdirSync(dirname(extensionPath), { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: brainstorming\ndescription: original\n---\noriginal\n",
    );
    writeFileSync(
      extensionPath,
      [
        'import { dirname, resolve } from "node:path";',
        'import { fileURLToPath } from "node:url";',
        "export default function (pi) {",
        '  const skillsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../skills");',
        '  pi.on("resources_discover", async () => ({ skillPaths: [skillsDir] }));',
        "}",
        "",
      ].join("\n"),
    );
  });

  afterEach(() => {
    if (originalPackagesDir === undefined) {
      delete process.env.CODING_AGENT_PI_PACKAGES_DIR;
    } else {
      process.env.CODING_AGENT_PI_PACKAGES_DIR = originalPackagesDir;
    }
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("binds resources_discover and selects the harness override", async () => {
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

    const winner = resourceLoader
      .getSkills()
      .skills.find((skill) => skill.name === "brainstorming");
    expect(winner?.filePath).toMatch(
      /packages[/\\]coding-agent[/\\]skills-override[/\\]brainstorming[/\\]SKILL\.md$/,
    );
    session.dispose();
  });
});
