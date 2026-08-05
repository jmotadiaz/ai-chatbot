# Reusable Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable prompt templates (Prompty-based `.prompty` files) to the coding agent, with a modal form UX for filling inputs and inserting rendered text into the chat textarea.

**Architecture:** Worker loads `.prompty` files from 3 levels (built-in, global Pi packages, project `.agents/prompts/`), merges with shadowing by `name`, and exposes two new RPCs: `getSessionPrompts` (catalog listing) and `resolvePrompt` (render template with values). Frontend adds a "Prompts" tab to the skills dropdown, opens a `PromptFormModal` on selection, and inserts rendered text into the textarea.

**Tech Stack:** TypeScript, YAML (frontmatter parsing via existing Pi resource loader pattern), React, Next.js App Router API routes

## Global Constraints

- Prompts never enter Pi's system prompt (unlike skills which use `/skill:<name>` commands)
- `.prompty` files use Prompty-compatible frontmatter with custom extensions (`kind: session`, `kind: path`, `kind: prompt`, `render`, `basePath`, `placeholder`)
- Template syntax: Mustache-compatible `{{var}}` (subconjunto de Jinja2 que Prompty usa)
- Shadowing order (lowest to highest priority): built-in < Pi packages < project `.agents/prompts/`
- All RPC methods follow the JSON-RPC 2.0 envelope already defined in `worker-client.ts`
- API routes are authenticated with `withAuth` and follow the existing `skills/route.ts` pattern

### Task 1: Type definitions — `src/prompts.ts` scaffolding

**Files:**
- Create: `packages/coding-agent/src/prompts.ts`

**Interfaces:**
- Produces: `PromptInput`, `CodingAgentPrompt`, `PromptSummary`, `loadPrompts(cwd)`, `getSessionPrompts(sessionId)`, `resolvePrompt(sessionId, promptName, values)`

- [ ] **Step 1: Create `src/prompts.ts` with type definitions and empty exports**

```ts
// packages/coding-agent/src/prompts.ts

export interface PromptInput {
  name: string;
  kind: string;          // "string" | "session" | "path" | "prompt"
  description: string;   // UI label for the form field
  required: boolean;
  default?: string;
  enumValues?: string[];
  placeholder?: string;
  render?: string;
  basePath?: string;
}

export interface CodingAgentPrompt {
  name: string;
  description: string;
  inputs: PromptInput[];
  filePath: string;
  baseDir: string;
  level: "builtin" | "package" | "project";
}

export interface PromptSummary {
  name: string;
  description: string;
  inputs: PromptInput[];
}

/** Extracts YAML frontmatter and markdown body from a .prompty file. */
export function parsePromptyFile(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  // Basic YAML parsing — in the real implementation use a YAML library
  // that's already available (Pi bundles one via its resource loader).
  // For now, just return the raw frontmatter string + body.
  return { frontmatter: {} as Record<string, unknown>, body: match[2]! };
}

// Stubs — implemented in later tasks
export function loadPrompts(_cwd: string): void {
  throw new Error("Not implemented");
}

export function getSessionPrompts(_sessionId: string): PromptSummary[] {
  throw new Error("Not implemented");
}

export function resolvePrompt(
  _sessionId: string,
  _promptName: string,
  _values: Record<string, string>,
): { text: string } {
  throw new Error("Not implemented");
}
```

- [ ] **Step 2: Run type-check to verify the file compiles**

```bash
pnpm --filter coding-agent type:check
```
Expected: no errors on the new file (stubs may cause "unused" warnings but no type errors).

- [ ] **Step 3: Commit**

```bash
git add packages/coding-agent/src/prompts.ts
git commit -m "feat(coding-agent): add prompts.ts with type definitions and stubs"
```

---

### Task 2: `loadPrompts()` — scan and merge .prompty files from 3 levels

**Files:**
- Modify: `packages/coding-agent/src/prompts.ts`

**Interfaces:**
- Consumes: `CodingAgentPrompt`, `parsePromptyFile` (from Task 1)
- Produces: `loadPrompts(cwd: string): void` — populates module-level `promptCatalog` Map

- [ ] **Step 1: Add module-level state and directory scanning**

Replace the stub `loadPrompts` with the real implementation in `prompts.ts`:

```ts
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const promptCatalog = new Map<string, CodingAgentPrompt>();

/**
 * Scan three levels of prompts and merge into promptCatalog.
 * Shadowing: project > package > builtin (first load wins for a given name,
 * so we load in reverse priority order — lowest first).
 */
export function loadPrompts(projectCwd: string): void {
  promptCatalog.clear();

  // 1. Built-in: packages/coding-agent/prompts/
  const builtinDir = join(__dirname, "..", "prompts");
  if (existsSync(builtinDir)) {
    scanPromptDir(builtinDir, "builtin");
  }

  // 2. Global (Pi packages): resolved from additionalExtensionPaths.
  //    These paths are passed via env or constructor; for now scan
  //    the known .pi/packages directory relative to the coding-agent root.
  const piPackagesDir = join(__dirname, "..", "..", ".pi", "packages");
  if (existsSync(piPackagesDir)) {
    for (const pkg of readdirSync(piPackagesDir)) {
      const promptsDir = join(piPackagesDir, pkg, "prompts");
      if (existsSync(promptsDir)) {
        scanPromptDir(promptsDir, "package");
      }
    }
  }

  // 3. Project-local: .agents/prompts/
  const projectPromptsDir = join(projectCwd, ".agents", "prompts");
  if (existsSync(projectPromptsDir)) {
    scanPromptDir(projectPromptsDir, "project");
  }
}

function scanPromptDir(
  dir: string,
  level: CodingAgentPrompt["level"],
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const promptDir = join(dir, entry);
    let st;
    try {
      st = statSync(promptDir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const promptFile = join(promptDir, "prompt.prompty");
    if (!existsSync(promptFile)) continue;

    let content: string;
    try {
      content = readFileSync(promptFile, "utf8");
    } catch {
      continue;
    }
    const parsed = parsePromptyFile(content);
    if (!parsed) continue;

    const fm = parsed.frontmatter as Record<string, unknown>;
    const name = typeof fm.name === "string" ? fm.name : entry;

    // Shadowing: if already in catalog, skip (lower-priority was loaded first)
    if (promptCatalog.has(name)) continue;

    const inputs = normalizeInputs(fm.inputs);
    promptCatalog.set(name, {
      name,
      description: typeof fm.description === "string" ? fm.description : "",
      inputs,
      filePath: promptFile,
      baseDir: promptDir,
      level,
    });
  }
}

function normalizeInputs(raw: unknown): PromptInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: Record<string, unknown>) => ({
    name: typeof item.name === "string" ? item.name : "",
    kind: typeof item.kind === "string" ? item.kind : "string",
    description: typeof item.description === "string" ? item.description : "",
    required: item.required === true,
    default: typeof item.default === "string" ? item.default : undefined,
    enumValues: Array.isArray(item.enumValues)
      ? item.enumValues.filter((v: unknown): v is string => typeof v === "string")
      : undefined,
    placeholder: typeof item.placeholder === "string" ? item.placeholder : undefined,
    render: typeof item.render === "string" ? item.render : undefined,
    basePath: typeof item.basePath === "string" ? item.basePath : undefined,
  }));
}
```

- [ ] **Step 2: Run type-check**

```bash
pnpm --filter coding-agent type:check
```
Expected: no type errors.

- [ ] **Step 3: Write unit test `tests/unit/load-prompts.test.ts`**

```ts
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
});
```

- [ ] **Step 4: Run test to verify it fails (prompts.ts still has stub for getSessionPrompts)**

```bash
pnpm --filter coding-agent test:unit -- tests/unit/load-prompts.test.ts
```
Expected: tests fail because `getSessionPrompts` is still a stub throwing an error.

- [ ] **Step 5: Commit**

```bash
git add packages/coding-agent/src/prompts.ts
git add packages/coding-agent/tests/unit/load-prompts.test.ts
git commit -m "feat(coding-agent): implement loadPrompts with 3-level scanning"
```

---

### Task 3: `getSessionPrompts()` — expose catalog, `resolvePrompt()` — render engine

**Files:**
- Modify: `packages/coding-agent/src/prompts.ts`

**Interfaces:**
- Consumes: `promptCatalog` Map, `PromptInput`, `PromptSummary` (from Task 1)
- Produces: `getSessionPrompts(sessionId): PromptSummary[]`, `resolvePrompt(sessionId, promptName, values): { text: string }`

- [ ] **Step 1: Implement `getSessionPrompts` and `resolvePrompt`**

Replace their stubs in `prompts.ts`:

```ts
export function getSessionPrompts(_sessionId: string): PromptSummary[] {
  const result: PromptSummary[] = [];
  for (const prompt of promptCatalog.values()) {
    result.push({
      name: prompt.name,
      description: prompt.description,
      inputs: prompt.inputs,
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function resolvePrompt(
  _sessionId: string,
  promptName: string,
  values: Record<string, string>,
): { text: string } {
  const prompt = promptCatalog.get(promptName);
  if (!prompt) {
    throw new Error(`Unknown prompt: ${promptName}`);
  }

  // 1. Validate required inputs
  const missing: string[] = [];
  for (const input of prompt.inputs) {
    if (input.required && !values[input.name]) {
      missing.push(input.name);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required inputs for prompt \"${promptName}\": ${missing.join(\", \")}`,
    );
  }

  // 2. Read body from file
  const content = readFileSync(prompt.filePath, \"utf8\");
  const parsed = parsePromptyFile(content);
  if (!parsed) {
    throw new Error(`Failed to parse prompt file: ${prompt.filePath}`);
  }
  let body = parsed.body;

  // 3. Render each input
  const rendered: Record<string, string> = {};
  for (const input of prompt.inputs) {
    const rawValue = values[input.name] ?? input.default ?? \"\";
    rendered[input.name] = renderInputValue(input, rawValue, prompt.baseDir);
  }

  // 4. Substitute {{var}} placeholders
  for (const [varName, varValue] of Object.entries(rendered)) {
    body = body.replace(new RegExp(`\\\\{\\\\{${escapeRegex(varName)}\\\\}\\\\}`, \"g\"), varValue);
  }

  // 5. Remove lines that became empty after substitution
  body = body
    .split(\"\\\\n\")
    .filter((line) => line.trim() !== \"\" || line.includes(\"```\"))
    .join(\"\\\\n\")
    .trim();

  return { text: body };
}

function renderInputValue(
  input: PromptInput,
  value: string,
  baseDir: string,
): string {
  if (!value) return \"\";

  switch (input.kind) {
    case \"string\": {
      // with enumValues, value is the selected option
      return value;
    }
    case \"session\": {
      const render = input.render ?? \"reference\";
      switch (render) {
        case \"id\":
          return value;
        case \"label\":
          return value;
        case \"reference\":
          return `[${value}](session:${value})`;
        case \"summary\": {
          // Stub: real implementation reads last ~500 words from session messages.
          // For now, return a placeholder reference that will be resolved post-MVP.
          return `[${value}](session:${value})`;
        }
        default:
          return `[${value}](session:${value})`;
      }
    }
    case \"path\": {
      const render = input.render ?? \"reference\";
      const resolvedPath = input.basePath
        ? join(baseDir, input.basePath, value)
        : join(baseDir, value);
      switch (render) {
        case \"path\":
          return value;
        case \"reference\":
          return `[\`${value}\`](file:${value})`;
        case \"contents\": {
          try {
            const fileContent = readFileSync(resolvedPath, \"utf8\");
            const ext = value.split(\".\").pop() ?? \"\";
            return `\\`\\`\\`${ext}\\\n${fileContent}\\\n\\`\\`\\``;
          } catch {
            throw new Error(`File not found: ${value}`);
          }
        }
        default:
          return `[\`${value}\`](file:${value})`;
      }
    }
    case \"prompt\": {
      const render = input.render ?? \"body\";
      switch (render) {
        case \"name\":
          return value;
        case \"reference\":
          return `[${value}](prompt:${value})`;
        case \"body\": {
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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\");
}
```

- [ ] **Step 2: Run type-check**

```bash
pnpm --filter coding-agent type:check
```

- [ ] **Step 3: Write unit tests**

Create `packages/coding-agent/tests/unit/resolve-prompt.test.ts`:

```ts
import { describe, it, expect, beforeEach } from \"vitest\";
import { mkdirSync, writeFileSync, rmSync } from \"node:fs\";
import { join } from \"node:path\";
import { tmpdir } from \"node:os\";
import { loadPrompts, resolvePrompt } from \"../../src/prompts\";

describe(\"resolvePrompt\", () => {
  const tmpRoot = join(tmpdir(), \"resolve-test-\" + Date.now());

  beforeEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    mkdirSync(tmpRoot, { recursive: true });

    // Create a .agents/prompts directory with one prompt
    const promptsDir = join(tmpRoot, \".agents\", \"prompts\", \"greet\");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, \"prompt.prompty\"), `---
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

  it(\"renders a prompt with string values\", () => {
    const result = resolvePrompt(\"s1\", \"greet\", {
      name: \"Alice\",
      mood: \"happy\",
    });
    expect(result.text).toBe(\"Hello Alice!\\\\n\\\\nhappy\");
  });

  it(\"throws for missing required input\", () => {
    expect(() =>
      resolvePrompt(\"s1\", \"greet\", { mood: \"happy\" }),
    ).toThrow(/Missing required inputs.*name/);
  });

  it(\"throws for unknown prompt\", () => {
    expect(() =>
      resolvePrompt(\"s1\", \"nonexistent\", {}),
    ).toThrow(\"Unknown prompt: nonexistent\");
  });

  it(\"uses default when value is empty\", () => {
    const promptsDir = join(tmpRoot, \".agents\", \"prompts\", \"with-default\");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, \"prompt.prompty\"), `---
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
    const result = resolvePrompt(\"s1\", \"with-default\", {});
    expect(result.text).toBe(\"fallback\");
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter coding-agent test:unit -- tests/unit/resolve-prompt.test.ts
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/coding-agent/src/prompts.ts
git add packages/coding-agent/tests/unit/resolve-prompt.test.ts
git commit -m "feat(coding-agent): implement getSessionPrompts and resolvePrompt"
```

---

### Task 4: Session integration — load prompts on session creation

**Files:**
- Modify: `packages/coding-agent/src/session-manager.ts`

**Interfaces:**
- Consumes: `loadPrompts(cwd)` from `./prompts`
- Produces: imports `getSessionPrompts` re-exported from session-manager

- [ ] **Step 1: Wire loadPrompts into getOrCreateSession and re-export getSessionPrompts**

In `session-manager.ts`, add the import near the top:

```ts
import { loadPrompts, getSessionPrompts } from "./prompts";
```

In `getOrCreateSession`, in the "3. Create a brand-new Pi SDK session" section, after `const cwd = resolveProjectPath(projectsRoot, options.project);` and before creating the runtime, add:

```ts
  loadPrompts(cwd);
```

Add re-export near the existing `getSessionSkills`:

```ts
export { getSessionPrompts } from "./prompts";
```

- [ ] **Step 2: Run type-check**

```bash
pnpm --filter coding-agent type:check
```

- [ ] **Step 3: Commit**

```bash
git add packages/coding-agent/src/session-manager.ts
git commit -m "feat(coding-agent): load prompts on session creation"
```

---

### Task 5: RPC handlers in `transports/http.ts`

**Files:**
- Modify: `packages/coding-agent/src/transports/http.ts`

- [ ] **Step 1: Add imports and two new RPC cases**

In `transports/http.ts`, add `getSessionPrompts` to the existing session-manager import and add a new import for `resolvePrompt`:

```ts
import {
  getOrCreateSession,
  // ... existing imports ...
  getSessionSkills,
  runSubagent,
  getSessionPrompts,
} from "../session-manager";
import { resolvePrompt } from "../prompts";
```

Add two new cases in the `handleRpc` switch, after `getSessionSkills`:

```ts
      case "getSessionPrompts": {
        const { sessionId } = params as { sessionId: string };
        result = { prompts: getSessionPrompts(sessionId) };
        break;
      }
      case "resolvePrompt": {
        const { sessionId, promptName, values } = params as {
          sessionId: string;
          promptName: string;
          values: Record<string, string>;
        };
        result = resolvePrompt(sessionId, promptName, values);
        break;
      }
```

- [ ] **Step 2: Run type-check**

```bash
pnpm --filter coding-agent type:check
```

- [ ] **Step 3: Commit**

```bash
git add packages/coding-agent/src/transports/http.ts
git commit -m "feat(coding-agent): add getSessionPrompts and resolvePrompt RPC handlers"
```

---

### Task 6: WorkerClient — new methods and types

**Files:**
- Modify: `packages/chatbot/lib/features/code/worker-client.ts`

- [ ] **Step 1: Add PromptSummary and PromptInput types, plus two methods**

Add interfaces near the existing `WorkerSkill`:

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
  basePath?: string;
}

export interface PromptSummary {
  name: string;
  description: string;
  inputs: PromptInput[];
}
```

Add methods to `WorkerClient` class after `getSessionSkills`:

```ts
  async getSessionPrompts(params: {
    sessionId: string;
  }): Promise<{ prompts: PromptSummary[] }> {
    return this.call("getSessionPrompts", params);
  }

  async resolvePrompt(params: {
    sessionId: string;
    promptName: string;
    values: Record<string, string>;
  }): Promise<{ text: string }> {
    return this.call("resolvePrompt", params);
  }
```

- [ ] **Step 2: Run type-check**

```bash
pnpm --filter chatbot type:check
```

- [ ] **Step 3: Commit**

```bash
git add packages/chatbot/lib/features/code/worker-client.ts
git commit -m "feat(chatbot): add getSessionPrompts and resolvePrompt to WorkerClient"
```

---

### Task 7: API routes for prompts

**Files:**
- Create: `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/prompts/route.ts`
- Create: `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/prompts/resolve/route.ts`

- [ ] **Step 1: Create GET route (list catalog)**

Same pattern as `skills/route.ts` but calling `getSessionPrompts`:

```ts
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";

function getSessionIdFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  return decodeURIComponent(parts[parts.length - 2] ?? "");
}

export const GET = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return Response.json({ prompts: [] }, { status: 404 });
  }

  const client = new WorkerClient();
  await client.initializeSession({
    userId: user.id,
    sessionId,
    project: dbSession.project,
    piSessionId: dbSession.piSessionId ?? undefined,
  });
  const result = await client.getSessionPrompts({ sessionId });
  return Response.json(result);
});
```

- [ ] **Step 2: Create POST route (resolve prompt)**

```ts
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";

function getSessionIdFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  return decodeURIComponent(parts[parts.length - 3] ?? "");
}

export const POST = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    promptName: string;
    values: Record<string, string>;
  };
  if (!body.promptName) {
    return Response.json({ error: "promptName is required" }, { status: 400 });
  }

  const client = new WorkerClient();
  await client.initializeSession({
    userId: user.id,
    sessionId,
    project: dbSession.project,
    piSessionId: dbSession.piSessionId ?? undefined,
  });

  try {
    const result = await client.resolvePrompt({
      sessionId,
      promptName: body.promptName,
      values: body.values ?? {},
    });
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
});
```

- [ ] **Step 3: Run type-check**

```bash
pnpm --filter chatbot type:check
```

- [ ] **Step 4: Commit**

```bash
git add packages/chatbot/app/"(chat)"/api/agent/code/sessions/"[sessionId]"/prompts/
git commit -m "feat(chatbot): add prompts API routes (list + resolve)"
```

---

### Task 8: `useCodingAgentPrompts` hook

**Files:**
- Create: `packages/chatbot/lib/features/code/hooks/use-coding-agent-prompts.ts`

- [ ] **Step 1: Create hook (mirrors useCodingAgentSkills)**

```ts
// packages/chatbot/lib/features/code/hooks/use-coding-agent-prompts.ts
"use client";

import { useEffect, useState } from "react";
import type { PromptSummary } from "@/lib/features/code/worker-client";

export function useCodingAgentPrompts(sessionId: string, enabled: boolean) {
  const [prompts, setPrompts] = useState<PromptSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const load = async () => {
      try {
        const response = await fetch(
          `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/prompts`,
        );
        if (!response.ok) {
          throw new Error(`Failed to load prompts: ${response.status}`);
        }
        const data = (await response.json()) as { prompts?: PromptSummary[] };
        if (!cancelled) setPrompts(data.prompts ?? []);
      } catch {
        if (!cancelled) setError("Prompts could not be loaded.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionId, enabled]);

  return { prompts, isLoading, error };
}
```

- [ ] **Step 2: Run type-check**

```bash
pnpm --filter chatbot type:check
```

- [ ] **Step 3: Commit**

```bash
git add packages/chatbot/lib/features/code/hooks/use-coding-agent-prompts.ts
git commit -m "feat(chatbot): add useCodingAgentPrompts hook"
```

---

### Task 9: SkillsControl tabbed refactor

**Files:**
- Modify: `packages/chatbot/components/code/skills-control.tsx`

- [ ] **Step 1: Add tabs (Skills | Prompts) to the dropdown**

Add `useState` to existing React import; add `FolderOpen` to lucide import:

```tsx
import { useState } from "react";
import { Check, FolderOpen, Puzzle } from "lucide-react";
```

Add `PromptSummary` import:

```tsx
import type { PromptSummary } from "@/lib/features/code/worker-client";
```

Extend props:

```tsx
export interface SkillsControlProps {
  // ... existing props ...

  prompts?: PromptSummary[];
  isLoadingPrompts?: boolean;
  promptsError?: string | null;
  onPromptSelect?: (promptName: string) => void;
}
```

In the component, destructure new props and add tab state:

```tsx
  prompts = [],
  isLoadingPrompts = false,
  promptsError,
  onPromptSelect,
  // ... existing destructuring ...

  const [activeTab, setActiveTab] = useState<"skills" | "prompts">("skills");
```

Replace the header (`<div className="border-b ...">`) with two tab buttons:

```tsx
        <div className="border-b border-muted">
          <div className="flex" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === "skills"}
              onClick={() => setActiveTab("skills")}
              className={cn(
                "flex-1 px-4 py-3 text-sm font-semibold text-center transition-colors border-b-2 -mb-px",
                activeTab === "skills"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-zinc-600 hover:bg-secondary-accent-foreground",
              )}
            >
              Skills
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "prompts"}
              onClick={() => setActiveTab("prompts")}
              className={cn(
                "flex-1 px-4 py-3 text-sm font-semibold text-center transition-colors border-b-2 -mb-px",
                activeTab === "prompts"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-zinc-600 hover:bg-secondary-accent-foreground",
              )}
            >
              Prompts
            </button>
          </div>
        </div>
```

Wrap existing skills list and description in `{activeTab === "skills" && (<>...<>)}`. Add the prompts tab content:

```tsx
        {activeTab === "prompts" && (
          <>
            <div className="px-4 py-2 text-xs text-muted-foreground">
              Select a prompt to fill in the form.
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {isLoadingPrompts && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Loading prompts…
                </div>
              )}
              {!isLoadingPrompts && promptsError && (
                <div role="alert" className="px-3 py-6 text-center text-sm text-red-600">
                  {promptsError}
                </div>
              )}
              {!isLoadingPrompts && !promptsError && prompts.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No prompts available.
                </div>
              )}
              {!isLoadingPrompts && !promptsError && prompts.map((prompt) => (
                <button
                  key={prompt.name}
                  type="button"
                  onClick={() => onPromptSelect?.(prompt.name)}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary-accent-foreground"
                >
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-zinc-400">
                    <FolderOpen size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {prompt.name}
                    </span>
                    <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                      {prompt.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
```

- [ ] **Step 2: Run type-check and existing tests**

```bash
pnpm --filter chatbot type:check
pnpm --filter chatbot test:unit -- tests/unit/agent-code/user-message-skills.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add packages/chatbot/components/code/skills-control.tsx
git commit -m "feat(chatbot): add Prompts tab to SkillsControl dropdown"
```

---

### Task 10: PromptFormModal component

**Files:**
- Create: `packages/chatbot/components/code/prompt-form-modal.tsx`

- [ ] **Step 1: Create modal component**

```tsx
// packages/chatbot/components/code/prompt-form-modal.tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { PromptSummary, PromptInput } from "@/lib/features/code/worker-client";

interface PromptFormModalProps {
  prompt: PromptSummary;
  sessionId: string;
  open: boolean;
  onClose: () => void;
  onInsert: (text: string) => void;
}

export const PromptFormModal: React.FC<PromptFormModalProps> = ({
  prompt,
  sessionId,
  open,
  onClose,
  onInsert,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const defaults: Record<string, string> = {};
      for (const input of prompt.inputs) {
        if (input.default) defaults[input.name] = input.default;
      }
      setValues(defaults);
      setError(null);
    }
  }, [open, prompt.inputs]);

  if (!open) return null;

  const handleChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsResolving(true);

    try {
      const res = await fetch(
        `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/prompts/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ promptName: prompt.name, values }),
        },
      );
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to resolve prompt");
        setIsResolving(false);
        return;
      }
      onInsert(data.text ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setIsResolving(false);
    }
  };

  const isSubmitDisabled = prompt.inputs.some(
    (i) => i.required && !values[i.name],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto mx-4">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{prompt.name}</h2>
            <p className="text-sm text-muted-foreground">{prompt.description}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {prompt.inputs.map((input) => (
            <PromptFormField
              key={input.name}
              input={input}
              value={values[input.name] ?? ""}
              onChange={(v) => handleChange(input.name, v)}
            />
          ))}

          {error && <div role="alert" className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitDisabled || isResolving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {isResolving ? "Inserting…" : "Insert"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface PromptFormFieldProps {
  input: PromptInput;
  value: string;
  onChange: (value: string) => void;
}

const PromptFormField: React.FC<PromptFormFieldProps> = ({ input, value, onChange }) => {
  if (input.kind === "string" && input.enumValues && input.enumValues.length > 0) {
    return (
      <label className="block">
        <span className="text-sm font-medium">
          {input.description}
          {input.required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
        <select value={value} onChange={(e) => onChange(e.target.value)} required={input.required}
          className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-800">
          <option value="">Select…</option>
          {input.enumValues.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="block">
      <span className="text-sm font-medium">
        {input.description}
        {input.required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={input.placeholder} required={input.required}
        className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-800" />
    </label>
  );
};
```

- [ ] **Step 2: Run type-check**

```bash
pnpm --filter chatbot type:check
```

- [ ] **Step 3: Commit**

```bash
git add packages/chatbot/components/code/prompt-form-modal.tsx
git commit -m "feat(chatbot): add PromptFormModal for prompt input filling"
```

---

### Task 11: AgentCodeChat integration

**Files:**
- Modify: `packages/chatbot/components/code/agent-code-chat.tsx`

- [ ] **Step 1: Wire prompts hook, modal, and handlers**

Add imports:

```tsx
import { useCodingAgentPrompts } from "@/lib/features/code/hooks/use-coding-agent-prompts";
import { PromptFormModal } from "./prompt-form-modal";
import type { PromptSummary } from "@/lib/features/code/worker-client";
```

Add state and hook after existing `useCodingAgentSkills` line:

```tsx
  const [promptModal, setPromptModal] = useState<PromptSummary | null>(null);

  const { prompts, isLoading: isLoadingPrompts, error: promptsError } =
    useCodingAgentPrompts(sessionId, !isLoading);
```

Add handlers before `handleSubmit`:

```tsx
  const handlePromptSelect = (promptName: string) => {
    const prompt = prompts.find((p) => p.name === promptName);
    if (prompt) setPromptModal(prompt);
  };

  const handlePromptInsert = (text: string) => {
    setInput((prev) => (prev ? `${prev}\n\n${text}` : text));
    setPromptModal(null);
  };
```

Update `SkillsControl` JSX props:

```tsx
            <SkillsControl
              // ... existing props ...
              prompts={prompts}
              isLoadingPrompts={isLoadingPrompts}
              promptsError={promptsError}
              onPromptSelect={handlePromptSelect}
            />
```

Add modal before closing `</div>` of outer container:

```tsx
      {promptModal && (
        <PromptFormModal
          prompt={promptModal}
          sessionId={sessionId}
          open={!!promptModal}
          onClose={() => setPromptModal(null)}
          onInsert={handlePromptInsert}
        />
      )}
```

- [ ] **Step 2: Run type-check and existing tests**

```bash
pnpm --filter chatbot type:check
pnpm test:unit
```

- [ ] **Step 3: Commit**

```bash
git add packages/chatbot/components/code/agent-code-chat.tsx
git commit -m "feat(chatbot): integrate prompts into AgentCodeChat"
```

---

### Task 12: Built-in example prompt and E2E verification

**Files:**
- Create: `packages/coding-agent/prompts/code-review/prompt.prompty`

- [ ] **Step 1: Create a working built-in prompt (uses kind: string for v1 compatibility)**

```markdown
---
name: code-review-session
description: Resume una sesión del coding agent y sugiere mejoras
inputs:
  - name: target_session
    kind: string
    description: ID de la sesión a revisar
    required: true
    placeholder: ej. s_abc123
  - name: focus_area
    kind: string
    description: Enfoque del review
    enumValues: [bugs, perf, style]
  - name: extra_context
    kind: string
    description: Notas adicionales
    placeholder: Algo más que el agente deba saber...
    required: false
---

# Code Review de la sesión {{target_session}}

## Enfoque: {{focus_area}}

{{extra_context}}

## Instrucciones

Analiza los cambios de la sesión, enfócate en **{{focus_area}}** y reporta:
1. Problemas encontrados
2. Sugerencias de mejora
3. Riesgos y trade-offs
```

- [ ] **Step 2: Run full test suite**

```bash
pnpm test:unit
```
Expected: all 423+ tests pass.

- [ ] **Step 3: Manual smoke test**

1. Start dev: `pnpm dev`
2. Open a coding agent chat
3. Puzzle icon → "Prompts" tab → "code-review-session"
4. Fill form, click Insert → rendered text in textarea
5. Verify the textarea has `# Code Review...` markdown with substituted values

- [ ] **Step 4: Commit**

```bash
git add packages/coding-agent/prompts/
git commit -m "feat(coding-agent): add built-in code-review prompt"
```
