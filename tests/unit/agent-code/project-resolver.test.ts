import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  listProjects,
  isValidProjectName,
} from "@/lib/features/agent-code/project-resolver";

describe("project-resolver", () => {
  let root: string;

  beforeEach(async () => {
    root = path.join(os.tmpdir(), `test-projects-${Date.now()}`);
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(path.join(root, "proj-a"));
    await fs.mkdir(path.join(root, "proj-b"));
    await fs.writeFile(path.join(root, "not-a-dir.txt"), "");
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("lists only first-level directories", async () => {
    const projects = await listProjects(root);
    expect(projects).toEqual(["proj-a", "proj-b"]);
  });

  it("rejects path traversal project names", () => {
    expect(isValidProjectName("../etc")).toBe(false);
    expect(isValidProjectName("proj-a")).toBe(true);
  });
});
