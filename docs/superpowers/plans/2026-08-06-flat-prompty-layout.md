# Flat Prompty Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the reusable-prompt system from directory-per-prompt (`prompts/<name>/prompt.prompty`) to flat Prompty-compliant files (`prompts/<name>.prompty`) and remove `kind: path` entirely.

**Architecture:** The worker's prompt catalog (`packages/coding-agent/src/prompts.ts`) scans three levels (built-in, Pi packages, project) and merges them with shadowing. Only the scanner changes: it reads `*.prompty` files directly instead of looking for `prompt.prompty` inside subdirectories. `kind: path` and its supporting properties (`PromptInput.basePath`, `CodingAgentPrompt.baseDir`) are deleted from the worker and the frontend's type mirror. The two existing prompt files are migrated to flat files; `name` comes from frontmatter `name`, falling back to the filename without `.prompty`.

**Tech Stack:** TypeScript, Node `node:fs`, Vitest (coding-agent + chatbot), pnpm workspaces.

**Spec:** [`docs/superpowers/specs/2026-08-06-flat-prompty-layout-design.md`](../specs/2026-08-06-flat-prompty-layout-design.md)

## Global Constraints

- Layout is `prompts/<name>.prompty` at all three levels; NO dual support of the old directory layout (clean break, spec D1).
- `kind: path` is removed completely: `PromptInput.basePath`, `CodingAgentPrompt.baseDir`, the `case "path"` in `renderInputValue`, and the `file_to_read` input of the test prompt (spec D2).
- `name` = frontmatter `name` if present, else the filename without `.prompty` (spec D3).
- A legacy directory `<prompts>/<entry>/prompt.prompty` is ignored with a `console.warn` pointing to the flat layout (spec §7 risk table).
- Historical docs (2026-08-03 and 2026-08-06 specs/plans) are NOT modified (spec D4).
- Every commit includes `Co-Authored-By: Claude Sonnet 4.5 <noreply@example.com>` (repo AGENTS.md).
- `.agents/prompts/` (the repo's project-level prompts) is untracked — migrate it locally with plain `mv`, do NOT `git add` it.

---

### Task 1: Flat-file scanner + migration (worker)

Makes the worker read `prompts/<name>.prompty`, migrates the two existing prompt files, and updates every test that writes prompt fixtures.

**Files:**
- Modify: `packages/coding-agent/src/prompts.ts`
- Rename: `packages/coding-agent/prompts/code-review/prompt.prompty` → `packages/coding-agent/prompts/code-review-session.prompty` (tracked, use `git mv`)
- Rename+edit: `.agents/prompts/test-all-kinds/prompt.prompty` → `.agents/prompts/test-all-kinds.prompty` (untracked, plain `mv`; remove the `file_to_read` input and its body section)
- Modify: `packages/coding-agent/tests/unit/load-prompts.test.ts`
- Modify: `packages/coding-agent/tests/unit/resolve-prompt.test.ts`
- Modify: `packages/chatbot/tests/unit/agent-code/session-manager-prompts.test.ts`

**Interfaces:**
- Consumes: current `scanPromptDir(dir, level, catalog)` scanning subdirectories for `prompt.prompty`; `CodingAgentPrompt { name, description, inputs, filePath, baseDir, level }`; `PromptInput` with `basePath`.
- Produces: `scanPromptDir` scanning `*.prompty` files directly (ignores dirs/other files, warns on legacy dirs); `CodingAgentPrompt { name, description, inputs, filePath, level }` (no `baseDir`); `PromptInput` with no `basePath`; `renderInputValue(input, value)` (no `baseDir` param, no path case). `loadPrompts`, `getProjectPrompts`, `resolveProjectPrompt` signatures unchanged — later tasks and the RPC layer keep working untouched.

- [ ] **Step 1: Migrate the built-in prompt to flat (red phase)**

```bash
cd /home/javier/projects/ai-chatbot
git mv packages/coding-agent/prompts/code-review/prompt.prompty packages/coding-agent/prompts/code-review-session.prompty
rmdir packages/coding-agent/prompts/code-review
git status --short   # expect: R  packages/coding-agent/prompts/code-review/prompt.prompty -> .../code-review-session.prompty
```

The file content is unchanged; the frontmatter `name: code-review-session` now matches the filename.

- [ ] **Step 2: Migrate the project test prompt to flat (red phase)**

```bash
cd /home/javier/projects/ai-chatbot
mv .agents/prompts/test-all-kinds/prompt.prompty .agents/prompts/test-all-kinds.prompty
rmdir .agents/prompts/test-all-kinds
```

Then rewrite `.agents/prompts/test-all-kinds.prompty` with this content (removes `file_to_read` input and its body section):

```markdown
---
name: test-all-kinds
description: Test prompt with one input of each kind (string, session, prompt)
inputs:
  - name: focus_area
    kind: string
    description: Area to focus on
    enumValues: [bugs, perf, style, security]
    required: true
  - name: target_session
    kind: session
    description: Session to inspect
    render: reference
    required: true
    placeholder: s_abc123
  - name: helper_prompt
    kind: prompt
    description: Helper prompt to compose
    render: reference
    required: false
    placeholder: code-review-session
---

# Review with focus on {{focus_area}}

## Session to inspect
{{target_session}}

## Composed helper
{{helper_prompt}}

Please review the session above, focusing on **{{focus_area}}**.
```

Do not `git add` this file — it was untracked before and stays untracked.

- [ ] **Step 3: Update `load-prompts.test.ts` fixtures to the flat layout (red phase)**

In `packages/coding-agent/tests/unit/load-prompts.test.ts`:

3a. Rename and rewrite the discovery test (drop the `mkdirSync` of the prompt dir; write the flat file directly):

```ts
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
```

3b. Replace the test "skips directories without prompt.prompty" with this (flat layout ignores non-`.prompty` files AND legacy prompt directories):

```ts
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
```

3c. Isolation test — write flat files instead of directories:

```ts
    const dirA = join(promptsDir, "alpha");
    mkdirSync(dirA, { recursive: true });
    writeFileSync(join(dirA, "prompt.prompty"), "---\nname: alpha\ndescription: from A\n---\nA");
```
becomes
```ts
    writeFileSync(join(promptsDir, "alpha.prompty"), "---\nname: alpha\ndescription: from A\n---\nA");
```
and
```ts
    const dirB = join(promptsDirB, "beta");
    mkdirSync(dirB, { recursive: true });
    writeFileSync(join(dirB, "prompt.prompty"), "---\nname: beta\ndescription: from B\n---\nB");
```
becomes
```ts
    writeFileSync(join(promptsDirB, "beta.prompty"), "---\nname: beta\ndescription: from B\n---\nB");
```

3d. On-demand test — flat:

```ts
    const dir = join(promptsDir, "on-demand");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "prompt.prompty"), "---\nname: on-demand\ndescription: loaded lazily\n---\non demand");
```
becomes
```ts
    writeFileSync(join(promptsDir, "on-demand.prompty"), "---\nname: on-demand\ndescription: loaded lazily\n---\non demand");
```

3e. Immutability test — flat (both the project and the fresh project C):

```ts
    const dir = join(promptsDir, "late-added");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "prompt.prompty"), "---\nname: late-added\ndescription: too late\n---\nlate");
```
becomes
```ts
    writeFileSync(join(promptsDir, "late-added.prompty"), "---\nname: late-added\ndescription: too late\n---\nlate");
```
and
```ts
    const projectDirC = join(tmpRoot, "project-c");
    mkdirSync(join(projectDirC, ".agents", "prompts", "late-added"), { recursive: true });
    writeFileSync(
      join(projectDirC, ".agents", "prompts", "late-added", "prompt.prompty"),
      "---\nname: late-added\ndescription: fresh\n---\nlate",
    );
```
becomes
```ts
    const projectDirC = join(tmpRoot, "project-c");
    mkdirSync(join(projectDirC, ".agents", "prompts"), { recursive: true });
    writeFileSync(
      join(projectDirC, ".agents", "prompts", "late-added.prompty"),
      "---\nname: late-added\ndescription: fresh\n---\nlate",
    );
```

- [ ] **Step 4: Update `resolve-prompt.test.ts` fixtures to the flat layout (red phase)**

In `packages/coding-agent/tests/unit/resolve-prompt.test.ts`:

4a. `beforeEach` — one flat file, no prompt subdirectory:

```ts
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
```

4b. "uses default when value is empty" — flat:

```ts
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
```

4c. "removes a line emptied by an unfilled optional input" — flat:

```ts
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
```

- [ ] **Step 5: Update `session-manager-prompts.test.ts` helper to the flat layout (red phase)**

In `packages/chatbot/tests/unit/agent-code/session-manager-prompts.test.ts`, replace the `writePrompt` helper and its doc comment:

```ts
/** Write a project prompt at <projectsRoot>/<project>/.agents/prompts/<name>.prompty */
function writePrompt(
  projectsRoot: string,
  project: string,
  name: string,
  body: string,
  inputs?: string,
): void {
  const promptsDir = join(projectsRoot, project, ".agents", "prompts");
  mkdirSync(promptsDir, { recursive: true });
  writeFileSync(
    join(promptsDir, `${name}.prompty`),
    `---\nname: ${name}\ndescription: ${name}\n${inputs ?? ""}---\n\n${body}`,
  );
}
```

All other tests in the file are unchanged.

- [ ] **Step 6: Run the coding-agent tests to verify they FAIL (red)**

```bash
cd /home/javier/projects/ai-chatbot/packages/coding-agent && pnpm exec vitest run tests/unit/load-prompts.test.ts tests/unit/resolve-prompt.test.ts
```

Expected: FAIL. The scanner still looks for `prompt.prompty` inside directories, so the flat fixtures are not discovered (`my-prompt`, `greet`, `alpha`, … not found) and the built-in `code-review-session` is gone (isolation test, builtin test).

- [ ] **Step 7: Rewrite `scanPromptDir` for flat files**

In `packages/coding-agent/src/prompts.ts`, replace the whole `scanPromptDir` function:

```ts
function scanPromptDir(
  dir: string,
  level: CodingAgentPrompt["level"],
  catalog: Map<string, CodingAgentPrompt>,
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    // Flat layout: prompts/<name>.prompty. Other files are ignored; legacy
    // prompts/<name>/prompt.prompty directories warn so authors migrate.
    if (!entry.endsWith(".prompty")) {
      if (existsSync(join(dir, entry, "prompt.prompty"))) {
        console.warn(
          `[prompts] Ignoring legacy prompt directory ${join(dir, entry)}; ` +
            `use the flat layout ${join(dir, `${entry}.prompty`)}.`,
        );
      }
      continue;
    }
    const promptFile = join(dir, entry);

    let content: string;
    try {
      content = readFileSync(promptFile, "utf8");
    } catch {
      continue;
    }
    const parsed = parsePromptyFile(content);
    if (!parsed) continue;

    const fm = parsed.frontmatter as Record<string, unknown>;
    const name =
      typeof fm.name === "string" ? fm.name : entry.slice(0, -".prompty".length);

    // Shadowing: if already in catalog, skip (lower-priority was loaded first)
    if (catalog.has(name)) continue;

    const inputs = normalizeInputs(fm.inputs);
    catalog.set(name, {
      name,
      description: typeof fm.description === "string" ? fm.description : "",
      inputs,
      filePath: promptFile,
      level,
    });
  }
}
```

- [ ] **Step 8: Remove `kind: path` from the worker source**

In `packages/coding-agent/src/prompts.ts`:

8a. Imports — drop `statSync`:

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
```

8b. `PromptInput` — remove `basePath`, update the kind comment:

```ts
export interface PromptInput {
  name: string;
  kind: string;          // "string" | "session" | "prompt"
  description: string;   // UI label for the form field
  required: boolean;
  default?: string;
  enumValues?: string[];
  placeholder?: string;
  render?: string;
}
```

8c. `CodingAgentPrompt` — remove `baseDir`:

```ts
export interface CodingAgentPrompt {
  name: string;
  description: string;
  inputs: PromptInput[];
  filePath: string;
  level: "builtin" | "package" | "project";
}
```

8d. `normalizeInputs` — remove the `basePath` mapping line:

```ts
    render: typeof item.render === "string" ? item.render : undefined,
```
(delete the line `basePath: typeof item.basePath === "string" ? item.basePath : undefined,` that follows it)

8e. `resolveProjectPrompt` — call `renderInputValue` without `baseDir`:

```ts
    rendered[input.name] = renderInputValue(input, rawValue, prompt.baseDir);
```
becomes
```ts
    rendered[input.name] = renderInputValue(input, rawValue);
```

8f. `renderInputValue` — drop the `baseDir` parameter and the whole `case "path"` block:

```ts
function renderInputValue(input: PromptInput, value: string): string {
  if (!value) return "";

  switch (input.kind) {
    case "string": {
      // with enumValues, value is the selected option
      return value;
    }
    case "session": {
      const render = input.render ?? "reference";
      switch (render) {
        case "id":
          return value;
        case "label":
          return value;
        case "reference":
          return `[${value}](session:${value})`;
        case "summary": {
          // Stub: real implementation reads last ~500 words from session messages.
          // For now, return a placeholder reference that will be resolved post-MVP.
          return `[${value}](session:${value})`;
        }
        default:
          return `[${value}](session:${value})`;
      }
    }
    case "prompt": {
      const render = input.render ?? "body";
      switch (render) {
        case "name":
          return value;
        case "reference":
          return `[${value}](prompt:${value})`;
        case "body": {
          // Recursive resolution — stub for now, full composition in Task 12
          return `[${value}](prompt:${value})`;
        }
        default:
          return `[${value}](prompt:${value})`;
      }
    }
    default:
      return value;
  }
}
```

- [ ] **Step 9: Run the coding-agent tests to verify they PASS (green)**

```bash
cd /home/javier/projects/ai-chatbot/packages/coding-agent && pnpm exec vitest run
```

Expected: PASS (all coding-agent test files). The built-in `code-review-session` is discovered again from `packages/coding-agent/prompts/code-review-session.prompty`.

- [ ] **Step 10: Check for stale references**

```bash
cd /home/javier/projects/ai-chatbot
rg -n "prompt\.prompty|baseDir|basePath|statSync|kind: path" packages/coding-agent/src packages/coding-agent/tests packages/chatbot/tests/unit/agent-code/session-manager-prompts.test.ts
```

Expected: exactly one match — the literal `prompt.prompty` inside the legacy-warning string in `scanPromptDir` (`packages/coding-agent/src/prompts.ts`). No matches for `baseDir`, `basePath`, `statSync` or `kind: path` anywhere.

- [ ] **Step 11: Run the chatbot unit tests**

```bash
cd /home/javier/projects/ai-chatbot && pnpm --filter chatbot test:unit
```

Expected: PASS (73 files / 440 tests, including `session-manager-prompts.test.ts`, `prompt-form-modal.test.tsx`, `prompts-route.test.ts`).

- [ ] **Step 12: Commit**

```bash
cd /home/javier/projects/ai-chatbot
git add packages/coding-agent/src/prompts.ts packages/coding-agent/prompts/code-review-session.prompty packages/coding-agent/tests/unit/load-prompts.test.ts packages/coding-agent/tests/unit/resolve-prompt.test.ts packages/chatbot/tests/unit/agent-code/session-manager-prompts.test.ts
git status --short   # confirm .agents/prompts/test-all-kinds.prompty is NOT staged (untracked)
git commit -m "refactor(coding-agent): scan flat prompts/<name>.prompty files and drop kind: path

Flat layout at all three levels (built-in, Pi packages, project),
matching the Prompty spec's single-file format; the directory layer
added no value and hid the code-review/code-review-session name
mismatch. Directories containing prompt.prompty are ignored with a
warning pointing at the flat layout (spec 2026-08-06 D1/D3/§7).

kind: path is removed entirely: PromptInput.basePath,
CodingAgentPrompt.baseDir, the renderInputValue path case and the
test prompt's file_to_read input (spec D2).

Co-Authored-By: Claude Sonnet 4.5 <noreply@example.com>"
```

---

### Task 2: Remove `kind: path` from the frontend contract (chatbot)

Removes the dead `basePath` from the frontend's type mirror of `PromptInput` and verifies nothing else references path plumbing.

**Files:**
- Modify: `packages/chatbot/lib/features/code/worker-client.ts`

**Interfaces:**
- Consumes: `PromptInput` in `worker-client.ts` (mirror of the worker's type, now without `basePath` after Task 1). `PromptFormModal` renders unknown kinds via the generic text input — no path-specific code exists in the frontend.
- Produces: `PromptInput { name, kind, description, required, default?, enumValues?, placeholder?, render? }` — no `basePath`.

- [ ] **Step 1: Remove `basePath` from `PromptInput`**

In `packages/chatbot/lib/features/code/worker-client.ts`:

```ts
export interface PromptInput {
  name: string;
  kind: string;
  description: string;
  required: boolean;
  default?: string;
  enumValues?: string[];
  placeholder?: string;
  render?: string;
}
```
(delete the line `basePath?: string;`)

- [ ] **Step 2: Verify no stray references**

```bash
cd /home/javier/projects/ai-chatbot
rg -n "basePath" packages/chatbot/lib packages/chatbot/components packages/chatbot/app --glob '!**/file-browser/**'
```

Expected: no output (the file browser has its own unrelated `basePath` concepts — excluded above; `worker-client.ts` must be clean).

- [ ] **Step 3: Run chatbot unit tests and type checks**

```bash
cd /home/javier/projects/ai-chatbot && pnpm --filter chatbot test:unit
pnpm --filter coding-agent type:check
```

Expected: PASS. (The pre-commit hook also runs `type:check` + `test:unit` on chatbot/models.)

- [ ] **Step 4: Commit**

```bash
cd /home/javier/projects/ai-chatbot
git add packages/chatbot/lib/features/code/worker-client.ts
git commit -m "refactor(chatbot): drop basePath from PromptInput type mirror

The worker no longer emits basePath after removing kind: path (spec
2026-08-06 D2); keeping it in the client type implied a contract the
worker no longer honors.

Co-Authored-By: Claude Sonnet 4.5 <noreply@example.com>"
```

---

## Final Verification

```bash
cd /home/javier/projects/ai-chatbot/packages/coding-agent && pnpm exec vitest run          # all coding-agent tests pass
cd /home/javier/projects/ai-chatbot && pnpm --filter chatbot test:unit                    # all chatbot tests pass
cd /home/javier/projects/ai-chatbot && rg -n "kind: path|baseDir" packages --glob '!**/node_modules/**'   # no path plumbing left
```

Manual smoke (optional): open the coding-agent chat in a project, open the Puzzle dropdown → Prompts tab; `test-all-kinds` (project) and `code-review-session` (built-in) must both list, and the test prompt's form must NOT show a `file_to_read` field.
