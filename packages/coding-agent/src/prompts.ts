import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getPiPackagesDir } from "./pi-packages";
import { PACKAGE_ROOT } from "./paths";

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

const promptCatalog = new Map<string, CodingAgentPrompt>();

/**
 * Scan three levels of prompts and merge into promptCatalog.
 * Shadowing: project > package > builtin (highest priority loaded first,
 * first-load-wins). A name present in multiple levels keeps the version
 * from the highest-priority level that defined it.
 */
export function loadPrompts(projectCwd: string): void {
  promptCatalog.clear();

  // 1. Project-local (HIGHEST priority — loads first, wins collisions)
  const projectPromptsDir = join(projectCwd, ".agents", "prompts");
  if (existsSync(projectPromptsDir)) {
    scanPromptDir(projectPromptsDir, "project");
  }

  // 2. Global (Pi packages)
  const piPackagesDir = getPiPackagesDir();
  if (existsSync(piPackagesDir)) {
    for (const pkg of readdirSync(piPackagesDir)) {
      const promptsDir = join(piPackagesDir, pkg, "prompts");
      if (existsSync(promptsDir)) {
        scanPromptDir(promptsDir, "package");
      }
    }
  }

  // 3. Built-in (LOWEST priority — loaded last, gets shadowed)
  const builtinDir = join(PACKAGE_ROOT, "prompts");
  if (existsSync(builtinDir)) {
    scanPromptDir(builtinDir, "builtin");
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

export function getSessionPrompts(_sessionId: string): PromptSummary[] {
  const result: PromptSummary[] = [];
  for (const prompt of promptCatalog.values()) {
    result.push({
      name: prompt.name,
      description: prompt.description,
      inputs: prompt.inputs,
      level: prompt.level,
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
    rendered[input.name] = renderInputValue(input, rawValue, prompt.baseDir);
  }

  // 4. Substitute {{var}} placeholders
  for (const [varName, varValue] of Object.entries(rendered)) {
    body = body.replace(
      new RegExp(`\\{\\{${escapeRegex(varName)}\\}\\}`, "g"),
      varValue,
    );
  }

  // 5. Remove lines that became empty after substitution
  body = body
    .split("\\n")
    .filter((line) => line.trim() !== "" || line.includes("```"))
    .join("\\n")
    .trim();

  return { text: body };
}

function renderInputValue(
  input: PromptInput,
  value: string,
  baseDir: string,
): string {
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
    case "path": {
      const render = input.render ?? "reference";
      const resolvedPath = input.basePath
        ? join(baseDir, input.basePath, value)
        : join(baseDir, value);
      switch (render) {
        case "path":
          return value;
        case "reference":
          return `[\`${value}\`](file:${value})`;
        case "contents": {
          try {
            const fileContent = readFileSync(resolvedPath, "utf8");
            const ext = value.split(".").pop() ?? "";
            return `\`\`\`${ext}\n${fileContent}\n\`\`\``;
          } catch {
            throw new Error(`File not found: ${value}`);
          }
        }
        default:
          return `[\`${value}\`](file:${value})`;
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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
