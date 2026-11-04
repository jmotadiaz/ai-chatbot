import fs from "node:fs/promises";
import path from "node:path";
import { config } from "config";
import { isSafeSegment } from "coding-agent/artifacts";
import { withAuth } from "@/lib/features/auth/with-auth/handler";

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://unpkg.com",
  "style-src 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://unpkg.com",
  "img-src data: blob: https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://unpkg.com",
  "font-src data: https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://unpkg.com",
  "connect-src blob:",
  "worker-src blob:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function getSegments(url: URL): { project: string; artifact: string } {
  const parts = url.pathname.split("/");
  // /api/agent/code/<project>/artifacts/<artifact>
  return {
    project: decodeURIComponent(parts[parts.length - 3] ?? ""),
    artifact: decodeURIComponent(parts[parts.length - 1] ?? ""),
  };
}

export const GET = withAuth(async (_user, req: Request) => {
  if (!config.codingAgentEnabled()) {
    return new Response("Not found", { status: 404 });
  }

  const root = config.codingAgentArtifactsDir();
  const url = new URL(req.url);
  const { project, artifact } = getSegments(url);

  if (!isSafeSegment(project) || !isSafeSegment(artifact)) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.resolve(root, project, artifact, "index.html");
  const resolvedRoot = path.resolve(root);
  // Belt-and-braces containment check inside the artifacts root. Resolve
  // symlinks so a link that points outside the root cannot escape it.
  let realRoot = resolvedRoot;
  let realFile = filePath;
  try {
    realRoot = await fs.realpath(resolvedRoot);
  } catch {
    // root may not exist yet; keep the lexical root
  }
  try {
    realFile = await fs.realpath(filePath);
  } catch {
    // file may not exist yet; fall back to the lexical path
  }
  if (
    realFile !== realRoot &&
    !realFile.startsWith(realRoot + path.sep)
  ) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const buffer = await fs.readFile(filePath);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": CSP,
      },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return new Response("Not found", { status: 404 });
    }
    throw err;
  }
});
