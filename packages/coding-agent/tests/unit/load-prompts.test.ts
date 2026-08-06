import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadPrompts, getProjectPrompts, type PromptSummary } from "../../src/prompts";

describe("loadPrompts", () => {
  let tmpRoot: string;
  let projectDir: string;
  let promptsDir: string;

  beforeEach(() => {
    // Unique root per test: the catalog is keyed by project path and loaded
    // at most once, so tests must not reuse paths across tests.
    tmpRoot = join(tmpdir(), "prompt-test-" + crypto.randomUUID());
    projectDir = join(tmpRoot, "project");
    promptsDir = join(projectDir, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  // Tests focus on project-level discovery. The built-in `code-review-session`
  // (and any future built-ins under packages/coding-agent/prompts/) is loaded
  // too. Filter to the project-level entries for the relevant assertions.
  const projectLevel = (prompts: PromptSummary[]) =>
    prompts.filter((p) => p.level === "project");

  it("discovers a .prompty file in .agents/prompts/<name>.prompty", () => {
    writeFileSync(join(promptsDir, "my-prompt.prompty"), `---
name: my-prompt
description: A test prompt
inputs:
  - name: question
    kind: string
    description: Your question
    required: true
    default: hello
---

{{question}}
`);

    loadPrompts(projectDir);
    const prompts = getProjectPrompts(projectDir);
    const project = projectLevel(prompts);

    expect(project).toHaveLength(1);
    expect(project[0]!.name).toBe("my-prompt");
    expect(project[0]!.description).toBe("A test prompt");
    expect(project[0]!.inputs).toHaveLength(1);
    expect(project[0]!.inputs[0]!.name).toBe("question");
    expect(project[0]!.inputs[0]!.kind).toBe("string");
    expect(project[0]!.inputs[0]!.default).toBe("hello");
    expect(project[0]!.inputs[0]!.required).toBe(true);
  });

  it("ignores files that are not .prompty and legacy prompt directories", () => {
    writeFileSync(join(promptsDir, "README.md"), "not a prompt");
    // Legacy prompts/<name>/prompt.prompty layout is no longer scanned
    const legacyDir = join(promptsDir, "legacy");
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, "prompt.prompty"), "---\nname: legacy\ndescription: old\n---\nold");

    loadPrompts(projectDir);
    const prompts = getProjectPrompts(projectDir);

    expect(projectLevel(prompts)).toHaveLength(0);
  });

  it("keeps each project's catalog isolated (no cross-pollination)", () => {
    const projectDirB = join(tmpRoot, "project-b");
    const promptsDirB = join(projectDirB, ".agents", "prompts");
    mkdirSync(promptsDirB, { recursive: true });
    writeFileSync(join(promptsDir, "alpha.prompty"), "---\nname: alpha\ndescription: from A\n---\nA");

    writeFileSync(join(promptsDirB, "beta.prompty"), "---\nname: beta\ndescription: from B\n---\nB");

    loadPrompts(projectDir);
    loadPrompts(projectDirB);

    const namesA = projectLevel(getProjectPrompts(projectDir))
      .map((p) => p.name)
      .sort();
    const namesB = projectLevel(getProjectPrompts(projectDirB))
      .map((p) => p.name)
      .sort();

    // Loading project B must not wipe or shadow project A's catalog, and
    // vice versa (the worker is one process serving sessions for many
    // projects at once).
    expect(namesA).toEqual(["alpha"]);
    expect(namesB).toEqual(["beta"]);
    // The built-in should be present for both projects (loaded from PACKAGE_ROOT)
    expect(getProjectPrompts(projectDir).map((p) => p.name)).toContain("code-review-session");
    expect(getProjectPrompts(projectDirB).map((p) => p.name)).toContain("code-review-session");
  });

  it("loads a project's catalog on first access", () => {
    writeFileSync(join(promptsDir, "on-demand.prompty"), "---\nname: on-demand\ndescription: loaded lazily\n---\non demand");

    // No explicit loadPrompts() call — the getter must load the project's
    // catalog itself (reconnect paths may never call loadPrompts directly).
    const prompts = getProjectPrompts(projectDir);

    expect(projectLevel(prompts).map((p) => p.name)).toContain("on-demand");
  });

  it("does not refresh an already-loaded project catalog (immutable per project)", () => {
    loadPrompts(projectDir);

    // A prompt added to disk after the first load must not appear: the
    // catalog is immutable for the lifetime of the project's sessions.
    writeFileSync(join(promptsDir, "late-added.prompty"), "---\nname: late-added\ndescription: too late\n---\nlate");
    loadPrompts(projectDir);

    expect(projectLevel(getProjectPrompts(projectDir)).map((p) => p.name)).not.toContain(
      "late-added",
    );

    // A fresh project (never loaded) does pick the prompt up.
    const projectDirC = join(tmpRoot, "project-c");
    mkdirSync(join(projectDirC, ".agents", "prompts"), { recursive: true });
    writeFileSync(
      join(projectDirC, ".agents", "prompts", "late-added.prompty"),
      "---\nname: late-added\ndescription: fresh\n---\nlate",
    );
    loadPrompts(projectDirC);

    expect(projectLevel(getProjectPrompts(projectDirC)).map((p) => p.name)).toContain(
      "late-added",
    );
  });

  it("builtin code-review-session declares target_session as kind session", () => {
    loadPrompts(projectDir);
    const prompts = getProjectPrompts(projectDir);
    const review = prompts.find((p) => p.name === "code-review-session");
    expect(review).toBeDefined();
    const target = review!.inputs.find((i) => i.name === "target_session");
    expect(target?.kind).toBe("session");
    expect(target?.placeholder).toBeUndefined();
  });
});
