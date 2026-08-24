import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import nunjucks from "nunjucks";
import { getPiPackagesDir } from "./pi-packages";
import { PACKAGE_ROOT } from "./paths";

/**
 * Nunjucks environment for prompt rendering (Jinja2 syntax per the Prompty
 * spec). Options are locked on purpose:
 * - `autoescape: false` — prompt text goes to a chat/textarea; HTML-escaping
 *   would corrupt markdown and code.
 * - `trimBlocks`/`lstripBlocks` — drop newlines and leading whitespace
 *   around block tags (`{% if %}` etc.) so empty blocks leave no stray
 *   blank lines.
 * - Missing variables render as `""` (`throwOnUndefined` default false),
 *   matching the pre-nunjucks behavior.
 * Stateless per render; safe to share across all sessions.
 */
const promptEnv = new nunjucks.Environment(null, {
  autoescape: false,
  trimBlocks: true,
  lstripBlocks: true,
});

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

export interface CodingAgentPrompt {
  name: string;
  description: string;
  inputs: PromptInput[];
  filePath: string;
  level: "builtin" | "package" | "project";
}

export interface PromptSummary {
  name: string;
  description: string;
  inputs: PromptInput[];
  level: CodingAgentPrompt["level"];
}

/** Extracts YAML frontmatter and markdown body from a .prompty file. */
export function parsePromptyFile(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} | null {
  const parsed = parseFrontmatter(content);
  // The SDK returns { frontmatter: {}, body: "" } for files with no
  // frontmatter; treat those as not-a-prompt.
  if (!parsed.body && Object.keys(parsed.frontmatter).length === 0) {
    return null;
  }
  return {
    frontmatter: parsed.frontmatter as Record<string, unknown>,
    body: parsed.body,
  };
}

/**
 * Prompt catalogs keyed by project cwd. The worker is a single process
 * serving sessions across projects, so a global catalog would leak prompts
 * between projects (session A listing B's prompts, resolvePrompt resolving
 * A's names against B's files) and be wiped by any session creation in
 * another project. Keying per project keeps each session's catalog isolated
 * and stable for the lifetime of the Pi session (spec 2026-08-03 §4.2).
 */
const promptCatalogs = new Map<string, Map<string, CodingAgentPrompt>>();

/**
 * Scan three levels of prompts for a project and merge them into that
 * project's catalog. Shadowing: project > package > builtin (highest
 * priority loaded first, first-load-wins). A name present in multiple
 * levels keeps the version from the highest-priority level that defined it.
 *
 * A project's catalog is loaded at most once: the catalog is immutable
 * during the life of a Pi session, so reconnects and later session
 * creations in the same project never re-scan (or mutate) it.
 */
export function loadPrompts(projectCwd: string): void {
  if (promptCatalogs.has(projectCwd)) return;

  const catalog = new Map<string, CodingAgentPrompt>();

  // 1. Project-local (HIGHEST priority — loads first, wins collisions)
  const projectPromptsDir = join(projectCwd, ".agents", "prompts");
  if (existsSync(projectPromptsDir)) {
    scanPromptDir(projectPromptsDir, "project", catalog);
  }

  // 2. Global (Pi packages)
  const piPackagesDir = getPiPackagesDir();
  if (existsSync(piPackagesDir)) {
    for (const pkg of readdirSync(piPackagesDir)) {
      const promptsDir = join(piPackagesDir, pkg, "prompts");
      if (existsSync(promptsDir)) {
        scanPromptDir(promptsDir, "package", catalog);
      }
    }
  }

  // 3. Built-in (LOWEST priority — loaded last, gets shadowed)
  const builtinDir = join(PACKAGE_ROOT, "prompts");
  if (existsSync(builtinDir)) {
    scanPromptDir(builtinDir, "builtin", catalog);
  }

  promptCatalogs.set(projectCwd, catalog);
}

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
  }));
}

/**
 * List the prompt summaries of a project's catalog. The catalog is loaded
 * on demand so any path that registers a session for the project (including
 * disk reloads after a worker restart) immediately sees its prompts without
 * an explicit `loadPrompts` call.
 */
export function getProjectPrompts(projectCwd: string): PromptSummary[] {
  loadPrompts(projectCwd);
  const catalog = promptCatalogs.get(projectCwd)!;
  const result: PromptSummary[] = [];
  for (const prompt of catalog.values()) {
    result.push({
      name: prompt.name,
      description: prompt.description,
      inputs: prompt.inputs,
      level: prompt.level,
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Render a prompt from a project's catalog.
 */
export function resolveProjectPrompt(
  projectCwd: string,
  promptName: string,
  values: Record<string, string>,
): { text: string } {
  loadPrompts(projectCwd);
  const prompt = promptCatalogs.get(projectCwd)?.get(promptName);
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
      `Missing required inputs for prompt "${promptName}": ${missing.join(", ")}`,
    );
  }

  // 2. Read body from file
  const content = readFileSync(prompt.filePath, "utf8");
  const parsed = parsePromptyFile(content);
  if (!parsed) {
    throw new Error(`Failed to parse prompt file: ${prompt.filePath}`);
  }
  let body = parsed.body;

  // 3. Render each input
  const rendered: Record<string, string> = {};
  for (const input of prompt.inputs) {
    const rawValue = values[input.name] ?? input.default ?? "";
    rendered[input.name] = renderInputValue(input, rawValue);
  }

  // 4. Render the body with nunjucks (Jinja2). Values are passed as the
  //    template context: they are never re-parsed, so `$` patterns and
  //    literal `{{`/`{%` inside values render as-is. Note: an undeclared
  //    `{{placeholder}}` now renders as "" (throwOnUndefined: false)
  //    instead of staying literal — nunjucks semantics, spec-consistent.
  let text: string;
  try {
    text = renderPromptBody(body, rendered);
  } catch (error) {
    // nunjucks reports syntax errors as a plain Error whose message embeds
    // the position, e.g. "(unknown path) [Line 3, Column 7]" — the sync
    // renderString path does not expose `err.lineno`.
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(/\[Line (\d+), Column (\d+)\]/);
    if (match) {
      throw new Error(
        `Prompt "${promptName}": error de plantilla en línea ${match[1]} de ${prompt.filePath}: ${message}`,
      );
    }
    throw new Error(
      `Prompt "${promptName}": error de plantilla de ${prompt.filePath}: ${message}`,
    );
  }
  return { text };
}

/**
 * Render a prompt body against the declared input values.
 *
 * Step 1 — render with nunjucks.
 * Step 2 — drop lines left empty by unfilled optional inputs (spec §4.3
 * step 5): a line that contained a `{{var}}` placeholder and rendered to
 * nothing is removed; lines that were blank in the template itself carry no
 * placeholder, so intentional blank lines are preserved. (Task 2 rewrites
 * this post-pass to also handle `{%...%}` block tags.)
 */
function renderPromptBody(body: string, view: Record<string, string>): string {
  const sourceLines = body.split("\n");
  const lineHasPlaceholder = sourceLines.map((line) =>
    /\{\{[^{}]*\}\}/.test(line),
  );
  body = promptEnv.renderString(body, view);
  return body
    .split("\n")
    .filter((line, index) => !(lineHasPlaceholder[index] && line.trim() === ""))
    .join("\n")
    .trim();
}

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

