import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

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
