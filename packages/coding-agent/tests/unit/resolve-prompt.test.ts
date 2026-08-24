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
    const promptsDir = join(tmpRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "greet.prompty"), `---
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
    const promptsDir = join(defaultRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "with-default.prompty"), `---
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
    const promptsDir = join(optRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "with-optional.prompty"), `---
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

  it("renders {% if %}/{% elif %}/{% else %} conditionals", () => {
    const condRoot = join(tmpRoot, "conditional-project");
    const promptsDir = join(condRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "classify.prompty"), `---
name: classify
description: Conditional
inputs:
  - name: type
    kind: string
    description: Tipo
    enumValues: [bug, perf, style]
---

{% if type == "bug" %}
BUG
{% elif type == "perf" %}
PERF
{% else %}
OTRO
{% endif %}`);

    loadPrompts(condRoot);
    expect(resolveProjectPrompt(condRoot, "classify", { type: "bug" }).text).toBe(
      "BUG",
    );
    expect(resolveProjectPrompt(condRoot, "classify", { type: "perf" }).text).toBe(
      "PERF",
    );
    expect(resolveProjectPrompt(condRoot, "classify", { type: "style" }).text).toBe(
      "OTRO",
    );
  });

  it("treats an empty string as falsy in {% if %}", () => {
    const truthRoot = join(tmpRoot, "truthy-project");
    const promptsDir = join(truthRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "flag.prompty"), `---
name: flag
description: Truthiness
inputs:
  - name: extra_context
    kind: string
    description: Extra
    required: false
---

{% if extra_context %}
Y
{% else %}
N
{% endif %}`);

    loadPrompts(truthRoot);
    expect(
      resolveProjectPrompt(truthRoot, "flag", { extra_context: "" }).text,
    ).toBe("N");
    expect(
      resolveProjectPrompt(truthRoot, "flag", { extra_context: "notas" }).text,
    ).toBe("Y");
  });

  it("renders {% for %} loops and {% set %}", () => {
    const loopRoot = join(tmpRoot, "loop-project");
    const promptsDir = join(loopRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "list.prompty"), `---
name: list
description: Loop
inputs:
  - name: items
    kind: string
    description: Items separados por newline
---

Items:
{% for i in items.split("\\n") %}- {{i}}
{% endfor %}
{% set total = "2" %}
Total: {{total}}`);

    loadPrompts(loopRoot);
    const result = resolveProjectPrompt(loopRoot, "list", {
      items: "a\nb",
    });
    expect(result.text).toBe("Items:\n- a\n- b\nTotal: 2");
  });

  it("wraps template syntax errors with file and line number", () => {
    const badRoot = join(tmpRoot, "bad-project");
    const promptsDir = join(badRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "bad.prompty"), `---
name: bad
description: Broken
inputs: []
---

Línea 1
{% if %}`);

    loadPrompts(badRoot);
    expect(() => resolveProjectPrompt(badRoot, "bad", {})).toThrow(
      /Prompt "bad": error de plantilla en línea 2 de .*bad\.prompty: \(unknown path\) \[Line 2, Column \d+\]/,
    );
  });

  it("does not re-parse braces inside substituted values", () => {
    const bracesRoot = join(tmpRoot, "braces-project");
    const promptsDir = join(bracesRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "braces.prompty"), `---
name: braces
description: Braces
inputs:
  - name: v
    kind: string
    description: Valor
---

{{v}}`);

    loadPrompts(bracesRoot);
    const result = resolveProjectPrompt(bracesRoot, "braces", {
      v: "{{nope}} y {% if %}",
    });
    expect(result.text).toBe("{{nope}} y {% if %}");
  });

  it("collapses blank lines around an emptied {% if %} block", () => {
    const ifRoot = join(tmpRoot, "if-empty-project");
    const promptsDir = join(ifRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "section.prompty"), `---
name: section
description: Section
inputs:
  - name: focus_area
    kind: string
    description: Enfoque
    enumValues: [bugs]
  - name: extra_context
    kind: string
    description: Extra
    required: false
---

# Cabecera

{% if focus_area %}
## Enfoque: {{ focus_area }}
{% endif %}

{% if extra_context %}
{{extra_context}}
{% endif %}

## Instrucciones

Analiza y enfócate en {{ focus_area }}.`);

    loadPrompts(ifRoot);
    const result = resolveProjectPrompt(ifRoot, "section", {
      focus_area: "bugs",
      extra_context: "",
    });
    expect(result.text).toBe(
      "# Cabecera\n\n## Enfoque: bugs\n\n## Instrucciones\n\nAnaliza y enfócate en bugs.",
    );

    const filled = resolveProjectPrompt(ifRoot, "section", {
      focus_area: "bugs",
      extra_context: "Presta atención a los tests",
    });
    expect(filled.text).toBe(
      "# Cabecera\n\n## Enfoque: bugs\n\nPresta atención a los tests\n\n## Instrucciones\n\nAnaliza y enfócate en bugs.",
    );

    const none = resolveProjectPrompt(ifRoot, "section", {
      focus_area: "",
      extra_context: "",
    });
    expect(none.text).toBe(
      "# Cabecera\n\n## Instrucciones\n\nAnaliza y enfócate en .",
    );
  });

  it("drops a {% if %}-only block that rendered to nothing", () => {
    const pureRoot = join(tmpRoot, "pure-artifact-project");
    const promptsDir = join(pureRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "pure.prompty"), `---
name: pure
description: Pure artifacts
inputs:
  - name: v
    kind: string
    description: Valor
    required: false
---

A
{% if v %}
{% endif %}
{{v}}
B`);

    loadPrompts(pureRoot);
    expect(resolveProjectPrompt(pureRoot, "pure", { v: "" }).text).toBe(
      "A\nB",
    );
  });
});
