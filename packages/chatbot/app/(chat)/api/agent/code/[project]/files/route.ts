import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { config, optional } from "config";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { assertWithinProject } from "@/lib/features/code/project-resolver";
import type {
  FileContentResult,
  FileEntry,
} from "@/components/code/file-browser/types";

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB
const BINARY_SNIFF_BYTES = 8000;
const DENYLIST = new Set([".git", "node_modules", ".next", ".turbo", ".DS_Store"]);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  md: "markdown",
  mdx: "mdx",
  css: "css",
  scss: "scss",
  html: "html",
  xml: "xml",
  svg: "xml",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sql: "sql",
  graphql: "graphql",
  vue: "vue",
  svelte: "svelte",
  prisma: "prisma",
  dockerfile: "docker",
};

function languageFromPath(filePath: string): string {
  const name = filePath.split("/").pop() ?? "";
  if (name.toLowerCase() === "dockerfile") return "docker";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return LANGUAGE_BY_EXTENSION[ext] ?? "plaintext";
}

function getProjectFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  // /api/agent/code/[project]/files
  return decodeURIComponent(parts[parts.length - 2] ?? "");
}

function looksBinary(buffer: Buffer): boolean {
  const len = Math.min(buffer.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

async function listDir(absPath: string, relPath: string): Promise<FileEntry[]> {
  const dirents = await fs.readdir(absPath, { withFileTypes: true });
  const entries: FileEntry[] = dirents
    .filter((d) => !DENYLIST.has(d.name))
    .filter((d) => d.isDirectory() || d.isFile())
    .map((d) => ({
      name: d.name,
      path: relPath ? `${relPath}/${d.name}` : d.name,
      kind: d.isDirectory() ? ("dir" as const) : ("file" as const),
    }));
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

export const GET = withAuth(async (_user, req: Request) => {
  if (!config.codingAgentEnabled()) {
    return new Response("Not found", { status: 404 });
  }
  const root = optional(() => config.codingAgentProjectsRoot());
  if (!root) {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(req.url);
  const project = getProjectFromUrl(url);
  const relPath = url.searchParams.get("path") ?? "";

  let absPath: string;
  try {
    absPath = assertWithinProject(root, project, relPath);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  try {
    const stat = await fs.stat(absPath);

    if (stat.isDirectory()) {
      const entries = await listDir(absPath, relPath.replace(/\/+$/, ""));
      const result: FileContentResult = { kind: "dir", entries };
      return NextResponse.json(result);
    }

    if (stat.size > MAX_FILE_SIZE) {
      const result: FileContentResult = { kind: "tooLarge", size: stat.size };
      return NextResponse.json(result);
    }

    const buffer = await fs.readFile(absPath);
    if (looksBinary(buffer)) {
      const result: FileContentResult = { kind: "binary" };
      return NextResponse.json(result);
    }

    const result: FileContentResult = {
      kind: "file",
      content: buffer.toString("utf8"),
      language: languageFromPath(relPath),
    };
    return NextResponse.json(result);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return new Response("Not found", { status: 404 });
    }
    throw err;
  }
});
