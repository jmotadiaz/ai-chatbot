---
name: writing-prompties
description: Use when creating, editing, or parameterizing reusable .prompty templates for the coding agent or chatbot harness
---

# Writing Prompties

## Overview

A `.prompty` file is a reusable prompt template that pairs YAML frontmatter (defining parameters and UI input fields) with a Jinja2/Nunjucks template body.

The coding agent and chatbot harness scan, parameterize, and render these prompts on-demand for both interactive chat sessions and automated coding workflows.

## When to Use

- Creating reusable prompt templates with interactive form inputs in the chat UI.
- Parameterizing recurring coding tasks (e.g., code reviews, test generation, refactorings).
- Adding project-specific prompts (`.agents/prompts/`) or built-in harness prompts (`packages/coding-agent/prompts/`).

### When NOT to Use

- Writing simple, one-off instructions in chat (just send the prompt directly).
- Adding permanent procedural instructions or workflow rules for the agent (use skills with `SKILL.md` instead).
- Setting global system instructions (use `AGENTS.md` or `SYSTEM.md`).

## File Location and Catalog Hierarchy

Prompts are discovered across three layers using a **flat layout** (`<name>.prompty` directly in the prompt directory).

1. **Project-local (Highest priority):**
   - Path: `.agents/prompts/<name>.prompty`
   - Scoped to the current repository or workspace.
2. **Global Pi Packages (Medium priority):**
   - Path: `.pi/packages/<pkg>/prompts/<name>.prompty`
3. **Built-in (Lowest priority):**
   - Path: `packages/coding-agent/prompts/<name>.prompty`
   - Bundled with the coding agent worker.

> [!IMPORTANT]
> **Flat Layout Only:** Prompts must be named `<name>.prompty` directly in the prompt directory. Do NOT create nested directories (e.g., `prompts/<name>/prompt.prompty` is ignored).
>
> **Shadowing:** If a prompt with the same `name` exists in multiple levels, the highest priority level wins (`project` > `package` > `builtin`).

## Structure of a `.prompty` File

Every `.prompty` file consists of two parts: YAML frontmatter and the template body.

````markdown
---
name: code-review-session
description: Summarises a coding agent session and suggests improvements
inputs:
  - name: target_session
    kind: session
    description: ID of the session to review
    required: true
  - name: focus_area
    kind: string
    description: Review focus
    enumValues: [bugs, perf, style]
  - name: context
    kind: string
    description: Optional additional context
    placeholder: Anything else the agent should know...
    required: false
---

# Code Review of session {{target_session}}

{% if focus_area %}
## Focus: {{ focus_area }}
{% endif %}

{% if context %}
{{ context }}
{% else %}
## Instructions

Review the session's changes and report the issues found and suggested improvements.
{% endif %}
````

---

## Frontmatter Specification

### Top-Level Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Optional | Unique prompt name. Defaults to the filename without `.prompty`. |
| `description` | string | Optional | Short description displayed in UI selectors. |
| `inputs` | list | Optional | List of parameter definitions rendered as form inputs in the UI. |

### Input Field Schema (`inputs`)

Each item in `inputs` defines one parameter:

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | string | Required | Variable name used in the template body (e.g. `{{target_session}}`). |
| `kind` | string | `"string"` | Type of input: `"string"`, `"session"`, or `"prompt"`. |
| `description` | string | `""` | Label displayed for the form field in the UI. |
| `required` | boolean | `false` | When `true`, rendering fails if no value is provided. |
| `default` | string | `undefined` | Default value used when input is omitted. |
| `enumValues` | string[] | `undefined` | Restricts value to a dropdown list in the UI. |
| `placeholder` | string | `undefined` | Placeholder text displayed in empty input fields. |
| `render` | string | `undefined` | Rendering mode (see table below). |

### Input `kind` and `render` Modes

- **`kind: string`**:
  - Standard text input or select dropdown (if `enumValues` is provided).
  - Interpolated directly as the string value.
- **`kind: session`**:
  - Represents a coding agent session ID.
  - `render` options:
    - `"reference"` (default): Renders markdown link `[<sessionId>](session:<sessionId>)`.
    - `"id"`: Renders raw session ID string.
    - `"label"`: Renders session title/label.
- **`kind: prompt`**:
  - References another prompt in the catalog for composition.
  - `render` options:
    - `"reference"` / `"body"`: Renders reference link `[<promptName>](prompt:<promptName>)`.
    - `"name"`: Renders prompt name string.

---

## Template Body Syntax (Nunjucks / Jinja2)

The prompt body is processed with Nunjucks using Jinja2 syntax:

### 1. Variables
```jinja2
Hello {{ user_name }}, please review {{ target_session }}.
```
- Missing or undeclared variables render as empty string `""` without throwing errors.
- HTML autoescaping is **disabled**, so markdown symbols (`#`, `*`, `` ` ``), quotes, and code blocks render verbatim.

### 2. Conditionals
```jinja2
{% if language %}
Write the solution strictly in {{ language }}.
{% else %}
Use the primary language of the repository.
{% endif %}
```

### 3. Iteration
```jinja2
{% for item in items %}
- Check {{ item }}
{% endfor %}
```

### 4. Whitespace & Empty Line Handling
The harness automatically cleans up blank lines resulting from collapsed template tags (`{% if %}`, `{% endif %}`) while preserving intentional blank lines in your markdown content.

---

## Concrete Examples

### Example 1: Minimal Task Template

File: `.agents/prompts/quick-refactor.prompty`
```markdown
---
name: quick-refactor
description: Refactor a file applying SOLID principles
inputs:
  - name: file_path
    kind: string
    description: Path to the file to refactor
    required: true
    placeholder: src/utils/helpers.ts
---

Please refactor the file `{{ file_path }}`:
1. Improve readability and modularity.
2. Keep existing behaviour and its tests untouched.
```

### Example 2: Parameterized Test Generator with Select Options

File: `.agents/prompts/generate-tests.prompty`
```markdown
---
name: generate-tests
description: Generate a unit or integration test suite
inputs:
  - name: component_path
    kind: string
    description: Component or module under test
    required: true
  - name: test_type
    kind: string
    description: Test type
    enumValues: [unit, integration, component]
    default: unit
  - name: framework
    kind: string
    description: Testing framework
    enumValues: [vitest, jest, playwright]
    default: vitest
---

Generate **{{ test_type }}** tests for `{{ component_path }}` using **{{ framework }}**.

Requirements:
- Cover edge cases and error handling.
- Follow the AAA convention (Arrange-Act-Assert).
- Place the test file in the folder the project's rules dictate.
```

---

## Common Mistakes & Troubleshooting

| Mistake | Consequence | Fix |
| --- | --- | --- |
| Nesting files (e.g. `prompts/review/prompt.prompty`) | Prompt is ignored by scanner | Use flat layout: `prompts/review.prompty` |
| Invalid YAML in frontmatter | Parsing fails, prompt not loaded | Validate YAML frontmatter (keys, indentation, hyphens) |
| Missing required input at render time | Throws error `Missing required inputs for prompt ...` | Provide the value or set `required: false` |
| Nunjucks syntax error (e.g. unclosed `{% if %}`) | Throws template error with line number | Ensure all `{% if %}` have matching `{% endif %}` |
| Expecting HTML escaping | Raw text is rendered | Nunjucks `autoescape` is disabled by design for markdown/code safety |
