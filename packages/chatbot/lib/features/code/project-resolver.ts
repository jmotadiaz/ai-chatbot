import fs from "node:fs/promises";
import path from "node:path";

export async function listProjects(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

export function isValidProjectName(name: string): boolean {
  if (
    !name ||
    name.includes("/") ||
    name.includes("\\") ||
    name === "." ||
    name === ".."
  ) {
    return false;
  }
  return /^[a-zA-Z0-9_.-]+$/.test(name);
}

export function resolveProjectPath(root: string, project: string): string {
  if (!isValidProjectName(project)) {
    throw new Error("Invalid project name");
  }
  return path.resolve(root, project);
}

/**
 * Resolves a relative path inside a project, rejecting any path that
 * escapes the project directory (e.g. via ".." segments or absolute paths).
 */
export function assertWithinProject(
  root: string,
  project: string,
  relPath: string,
): string {
  const projectRoot = resolveProjectPath(root, project);
  if (path.isAbsolute(relPath)) {
    throw new Error("Invalid path");
  }
  const resolved = path.resolve(projectRoot, relPath);
  if (resolved !== projectRoot && !resolved.startsWith(projectRoot + path.sep)) {
    throw new Error("Invalid path");
  }
  return resolved;
}
