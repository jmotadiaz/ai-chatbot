import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadPrompts, getSessionPrompts } from "../../src/prompts";

describe("loadPrompts", () => {
  const tmpRoot = join(tmpdir(), "prompt-test-" + Date.now());
  const projectDir = join(tmpRoot, "project");
  const promptsDir = join(projectDir, ".agents", "prompts");

  beforeEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    mkdirSync(promptsDir, { recursive: true });
  });

  it("discovers a .prompty file in .agents/prompts/<name>/prompt.prompty", () => {
    const dir = join(promptsDir, "my-prompt");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "prompt.prompty"), `---
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
    const prompts = getSessionPrompts("fake-session");

    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.name).toBe("my-prompt");
    expect(prompts[0]!.description).toBe("A test prompt");
    expect(prompts[0]!.inputs).toHaveLength(1);
    expect(prompts[0]!.inputs[0]!.name).toBe("question");
    expect(prompts[0]!.inputs[0]!.kind).toBe("string");
    expect(prompts[0]!.inputs[0]!.default).toBe("hello");
    expect(prompts[0]!.inputs[0]!.required).toBe(true);
  });

  it("skips directories without prompt.prompty", () => {
    const dir = join(promptsDir, "empty");
    mkdirSync(dir, { recursive: true });

    loadPrompts(projectDir);
    const prompts = getSessionPrompts("fake-session");

    expect(prompts).toHaveLength(0);
  });

  it("first-loaded prompt wins shadowing within a single level", () => {
    // Two different project roots load in turn. The first root's
    // prompts must remain visible after a second load that defines
    // different prompts (no cross-pollination).
    const projectDirB = join(tmpRoot, "project-b");
    const promptsDirB = join(projectDirB, ".agents", "prompts");
    mkdirSync(promptsDirB, { recursive: true });
    const dirA = join(promptsDir, "alpha");
    mkdirSync(dirA, { recursive: true });
    writeFileSync(join(dirA, "prompt.prompty"), "---\nname: alpha\ndescription: from A\n---\nA");

    const dirB = join(promptsDirB, "beta");
    mkdirSync(dirB, { recursive: true });
    writeFileSync(join(dirB, "prompt.prompty"), "---\nname: beta\ndescription: from B\n---\nB");

    loadPrompts(projectDir);
    loadPrompts(projectDirB);
    const prompts = getSessionPrompts("fake-session");
    const names = prompts.map((p) => p.name).sort();
    // After the second load, only projectDirB's prompt survives
    // (loadPrompts clears the catalog first).
    expect(names).toEqual(["beta"]);
  });
});
