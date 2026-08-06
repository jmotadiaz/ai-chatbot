import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadPrompts, resolveProjectPrompt } from "../../src/prompts";

describe("resolveProjectPrompt", () => {
  let tmpRoot: string;

  beforeEach(() => {
    // Unique root per test: the catalog is keyed by project path and loaded
    // at most once, so tests must not reuse paths across tests.
    tmpRoot = join(tmpdir(), "resolve-test-" + crypto.randomUUID());
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

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("renders a prompt with string values", () => {
    const result = resolveProjectPrompt(tmpRoot, "greet", {
      name: "Alice",
      mood: "happy",
    });
    expect(result.text).toBe("Hello Alice!\n\nhappy");
  });

  it("throws for missing required input", () => {
    expect(() =>
      resolveProjectPrompt(tmpRoot, "greet", { mood: "happy" }),
    ).toThrow(/Missing required inputs.*name/);
  });

  it("throws for unknown prompt", () => {
    expect(() =>
      resolveProjectPrompt(tmpRoot, "nonexistent", {}),
    ).toThrow("Unknown prompt: nonexistent");
  });

  it("uses default when value is empty", () => {
    const defaultRoot = join(tmpRoot, "default-project");
    const promptsDir = join(defaultRoot, ".agents", "prompts", "with-default");
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

    loadPrompts(defaultRoot);
    const result = resolveProjectPrompt(defaultRoot, "with-default", {});
    expect(result.text).toBe("fallback");
  });

  it("removes a line emptied by an unfilled optional input and preserves intentional blank lines", () => {
    const optRoot = join(tmpRoot, "optional-project");
    const promptsDir = join(optRoot, ".agents", "prompts", "with-optional");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "prompt.prompty"), `---
name: with-optional
description: Has optional input
inputs:
  - name: name
    kind: string
    description: Person name
    required: true
  - name: extra_context
    kind: string
    description: Extra notes
    required: false
---

Hello {{name}}!
{{extra_context}}

Done.`);

    loadPrompts(optRoot);
    const result = resolveProjectPrompt(optRoot, "with-optional", { name: "Alice" });
    expect(result.text).toBe("Hello Alice!\n\nDone.");

    const filled = resolveProjectPrompt(optRoot, "with-optional", {
      name: "Alice",
      extra_context: "Be thorough",
    });
    expect(filled.text).toBe("Hello Alice!\nBe thorough\n\nDone.");
  });

  it("does not interpret $ patterns inside substituted values", () => {
    const result = resolveProjectPrompt(tmpRoot, "greet", {
      name: "A$&B",
      mood: "happy",
    });
    expect(result.text).toBe("Hello A$&B!\n\nhappy");
  });
});
