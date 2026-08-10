import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import {
  PI_PACKAGES,
  applyManifestSkillPatches,
  getExtensionPaths,
  getPiPackagePath,
  removePiSkillsFromManifest,
  type PiPackage,
} from "../../src/pi-packages";

/**
 * These tests guard the override-skill precedence fix: the harness override
 * (`skills-override/brainstorming`) must shadow the superpowers
 * `brainstorming`. That only works if the package's skills reach sessions
 * through its extension `resources_discover` (loaded after the override
 * extension) instead of the `pi.skills` manifest entry (loaded by the SDK's
 * `reload()`, before any extension hook).
 */

describe("removePiSkillsFromManifest", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), "pi-pkg-test-" + crypto.randomUUID());
    mkdirSync(tmpRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("removes the pi.skills entry and preserves the rest of the manifest, reporting a change", () => {
    const manifestPath = join(tmpRoot, "package.json");
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          name: "superpowers",
          version: "6.2.0",
          pi: {
            extensions: ["./.pi/extensions/superpowers.ts"],
            skills: ["./skills"],
          },
        },
        null,
        2,
      ),
    );

    const changed = removePiSkillsFromManifest(manifestPath);

    expect(changed).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.name).toBe("superpowers");
    expect(manifest.pi).toEqual({ extensions: ["./.pi/extensions/superpowers.ts"] });
  });

  it("is a no-op when the manifest has no pi.skills entry", () => {
    const manifestPath = join(tmpRoot, "package.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({ name: "plain-pkg", pi: { extensions: ["./ext.ts"] } }, null, 2),
    );

    const changed = removePiSkillsFromManifest(manifestPath);

    expect(changed).toBe(false);
    expect(JSON.parse(readFileSync(manifestPath, "utf-8"))).toEqual({
      name: "plain-pkg",
      pi: { extensions: ["./ext.ts"] },
    });
  });
});

describe("override skill precedence (SDK assumption)", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), "skill-order-test-" + crypto.randomUUID());
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

  it("loadSkills keeps the FIRST skill that claims a name, so the override dir must precede the package's", async () => {
    // The SDK does not export loadSkills through its package exports, so
    // resolve the dist entry and import the sibling module by absolute path.
    const sdkEntry = new URL(import.meta.resolve("@earendil-works/pi-coding-agent"));
    const { loadSkills } = await import(join(dirname(fileURLToPath(sdkEntry)), "core", "skills.js"));

    const overrideDir = join(tmpRoot, "skills-override");
    const packageSkillsDir = join(tmpRoot, "package-skills");
    writeSkill(overrideDir, "override");
    writeSkill(packageSkillsDir, "original");

    // Post-fix order (override dir first): the override wins.
    const postFix = loadSkills({
      cwd: tmpRoot,
      agentDir: tmpRoot,
      skillPaths: [overrideDir, packageSkillsDir],
      includeDefaults: false,
    });
    expect(postFix.skills.find((s) => s.name === "brainstorming")?.filePath).toBe(
      join(overrideDir, "brainstorming", "SKILL.md"),
    );

    // Pre-fix order (package dir first): the original wins — the bug the
    // manifest patch prevents.
    const preFix = loadSkills({
      cwd: tmpRoot,
      agentDir: tmpRoot,
      skillPaths: [packageSkillsDir, overrideDir],
      includeDefaults: false,
    });
    expect(preFix.skills.find((s) => s.name === "brainstorming")?.filePath).toBe(
      join(packageSkillsDir, "brainstorming", "SKILL.md"),
    );
  });
});

describe("applyManifestSkillPatches", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), "apply-patch-test-" + crypto.randomUUID());
    mkdirSync(tmpRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  const writeManifest = (dir: string) => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name: "superpowers",
          pi: { extensions: ["./.pi/extensions/superpowers.ts"], skills: ["./skills"] },
        },
        null,
        2,
      ),
    );
  };

  it("strips pi.skills from the checkout of a package flagged for the patch", () => {
    // superpowers is the package whose skills must load via its extension.
    const flagged = PI_PACKAGES.find((p) => p.name === "superpowers");
    expect(flagged?.stripManifestSkills).toBe(true);
    const checkout = join(tmpRoot, "superpowers");
    mkdirSync(checkout, { recursive: true });
    writeManifest(checkout);

    applyManifestSkillPatches(flagged!, checkout);

    const manifest = JSON.parse(readFileSync(join(checkout, "package.json"), "utf-8"));
    expect(manifest.pi).toEqual({ extensions: ["./.pi/extensions/superpowers.ts"] });
  });

  it("leaves unflagged packages untouched", () => {
    const unflagged: PiPackage = {
      name: "plain-pkg",
      repo: "https://example.invalid/repo.git",
      defaultRef: "v1.0.0",
      refEnvVar: "PLAIN_REF",
    };
    const checkout = join(tmpRoot, "plain-pkg");
    mkdirSync(checkout, { recursive: true });
    writeManifest(checkout);

    applyManifestSkillPatches(unflagged, checkout);

    const manifest = JSON.parse(readFileSync(join(checkout, "package.json"), "utf-8"));
    expect(manifest.pi.skills).toEqual(["./skills"]);
  });
});

describe("getExtensionPaths", () => {
  const superpowersPkg = PI_PACKAGES.find((p) => p.name === "superpowers")!;
  const manifestPath = join(getPiPackagePath(superpowersPkg), "package.json");
  let originalManifest: string;

  beforeEach(() => {
    originalManifest = readFileSync(manifestPath, "utf-8");
  });

  afterEach(() => {
    writeFileSync(manifestPath, originalManifest);
  });

  it("applies manifest skill patches at runtime so pi.skills does not shadow skills-override", () => {
    // Simulate a checkout whose manifest was restored to the upstream version
    // (with pi.skills) after the install script ran.
    const manifest = JSON.parse(originalManifest);
    manifest.pi ??= {};
    manifest.pi.skills = ["./skills"];
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    expect(JSON.parse(readFileSync(manifestPath, "utf-8")).pi.skills).toBeDefined();

    getExtensionPaths();

    const patched = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(patched.pi.skills).toBeUndefined();
    expect(patched.pi.extensions).toEqual(["./.pi/extensions/superpowers.ts"]);
  });
});
