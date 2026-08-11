import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { config, optional } from "config";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { resolveProjectPath } from "@/lib/features/code/project-resolver";
import {
  buildChangedFiles,
  parsePorcelainStatus,
  parseUnifiedDiff,
} from "@/lib/features/code/file-browser/git-diff-parse";
import type { ChangesResult } from "@/components/code/file-browser/types";

const execFileAsync = promisify(execFile);
const GIT_OUTPUT_MAX_BUFFER = 10 * 1024 * 1024;

function getProjectFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  // /api/agent/code/[project]/changes
  return decodeURIComponent(parts[parts.length - 2] ?? "");
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: GIT_OUTPUT_MAX_BUFFER,
  });
  return stdout;
}

export const GET = withAuth(async (_user, req: Request) => {
  if (!config.codingAgentEnabled()) {
    return new Response("Not found", { status: 404 });
  }
  const root = optional(() => config.codingAgentProjectsRoot());
  if (!root) {
    return new Response("Not found", { status: 404 });
  }

  const project = getProjectFromUrl(new URL(req.url));
  let projectPath: string;
  try {
    projectPath = resolveProjectPath(root, project);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  try {
    await git(projectPath, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    const result: ChangesResult = { isGitRepo: false, files: [] };
    return NextResponse.json(result);
  }

  const statusOutput = await git(projectPath, ["status", "--porcelain=v1"]);
  let diffOutput: string;
  try {
    // HEAD covers staged + unstaged changes; fails on a repo with no commits.
    diffOutput = await git(projectPath, ["diff", "--unified=3", "HEAD"]);
  } catch {
    diffOutput = await git(projectPath, ["diff", "--unified=3"]);
  }

  const result: ChangesResult = {
    isGitRepo: true,
    files: buildChangedFiles(
      parsePorcelainStatus(statusOutput),
      parseUnifiedDiff(diffOutput),
    ),
  };
  return NextResponse.json(result);
});
