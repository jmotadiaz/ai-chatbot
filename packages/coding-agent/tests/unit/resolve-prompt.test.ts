import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadPrompts, resolvePrompt } from "../../src/prompts";

describe("resolvePrompt", () => {
  const tmpRoot = join(tmpdir(), "resolve-test-" + Date.now());

  beforeEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    mkdirSync(tmpRoot, { recursive: true });

    // Create a .agents/prompts directory with one prompt
    const promptsDir = join(tmpRoot, ".agents", "prompts", "greet");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "prompt.prompty"), `---
name: greet
description: Greet someone
inputs:
  - name: name
    kind: string
    description: Person name
    required: true
  - name: mood
    kind: string
    description: Mood
    enumValues: [happy, formal, casual]
---

Hello {{name}}!

{{mood}}
`);

    loadPrompts(tmpRoot);
  });

  it("renders a prompt with string values", () => {
    const result = resolvePrompt("s1", "greet", {
      name: "Alice",
      mood: "happy",
    });
    expect(result.text).toBe("Hello Alice!\n\nhappy");
  });

  it("throws for missing required input", () => {
    expect(() =>
      resolvePrompt("s1", "greet", { mood: "happy" }),
    ).toThrow(/Missing required inputs.*name/);
  });

  it("throws for unknown prompt", () => {
    expect(() =>
      resolvePrompt("s1", "nonexistent", {}),
    ).toThrow("Unknown prompt: nonexistent");
  });

  it("uses default when value is empty", () => {
    const promptsDir = join(tmpRoot, ".agents", "prompts", "with-default");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "prompt.prompty"), `---
name: with-default
description: Has default
inputs:
  - name: msg
    kind: string
    description: Message
    default: fallback
---

{{msg}}
`);

    loadPrompts(tmpRoot);
    const result = resolvePrompt("s1", "with-default", {});
    expect(result.text).toBe("fallback");
  });
});
