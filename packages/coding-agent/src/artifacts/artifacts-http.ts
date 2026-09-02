import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { contentTypeFor, isSafeSegment, listArtifacts, resolveArtifactFile, type ArtifactRef } from "./artifacts";

/**
 * Read-only HTTP surface over the artifacts root (`src/artifacts.ts`), served
 * by the worker next to `POST /rpc`:
 *
 *   GET /artifacts/                    → HTML index of published artifacts
 *   GET /artifacts/?format=json        → the same index as JSON
 *   GET /artifacts/<project>/<name>    → the artifact itself, inline in the browser
 *
 * The index links relatively (`<project>/<name>`) and `/artifacts` redirects to
 * `/artifacts/` to make that resolve: the worker is reached through whatever
 * host the user's browser happens to use (LAN IP, tailnet, tunnel), and a
 * host-built absolute link would point somewhere else. The agent still gets an
 * absolute URL from `publish_artifact` — that one has to be followable from a
 * chat message, where there is no base to resolve against.
 */

/** Path kinds `matchArtifactRoute` distinguishes. */
export type ArtifactRoute =
  | {
      kind: "index";
      /** `/artifacts` without a trailing slash: relative links would escape it. */
      redirect: boolean;
      json: boolean;
    }
  /** Under `/artifacts` but not a valid artifact path (bad segment, wrong depth). */
  | { kind: "invalid" }
  | { kind: "file"; project: string; name: string };

export interface ArtifactRequestDeps {
  rootDir: string;
  baseUrl: string;
}

/**
 * Classify a request URL. Returns undefined when the URL is not under
 * `/artifacts` at all, so the caller keeps handling `/rpc` and friends.
 */
export function matchArtifactRoute(url: string | undefined): ArtifactRoute | undefined {
  if (!url) return undefined;
  const [pathname = "", query = ""] = url.split("?");
  const cleanPath = pathname.split("#")[0] ?? "";
  if (cleanPath !== "/artifacts" && !cleanPath.startsWith("/artifacts/")) return undefined;

  const rest = decode(cleanPath.slice("/artifacts".length)).replace(/^\/+|\/+$/g, "");
  if (!rest) {
    return {
      kind: "index",
      redirect: cleanPath === "/artifacts",
      json: new URLSearchParams(query).get("format") === "json",
    };
  }

  const segments = rest.split("/");
  if (segments.length !== 2 || segments.some((s) => !isSafeSegment(s))) {
    return { kind: "invalid" };
  }
  const [project, name] = segments as [string, string];
  return { kind: "file", project, name };
}

/**
 * `Content-Security-Policy` for the generated reports.
 *
 * The skills load Tailwind and Mermaid from CDNs and style with inline
 * `class`/`<style>`, and Mermaid pulls its chunks and fonts from jsdelivr as
 * ESM. Anything tighter renders an unstyled page with empty diagram slots — the
 * classic "the report looks broken" — so the CDNs are allowlisted rather than
 * the policy dropped. `cdn.tailwindcss.com` is a JIT: without `'unsafe-eval'`
 * it installs no styles at all.
 */
export function artifactCsp(contentType: string): string | undefined {
  if (!contentType.startsWith("text/html")) return undefined;
  const cdn = "https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://unpkg.com";
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' ${cdn}`,
    `style-src 'unsafe-inline' ${cdn}`,
    `img-src data: blob: ${cdn}`,
    `font-src data: ${cdn}`,
    "connect-src blob:",
    "worker-src blob:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** Serve an artifact route. Returns false when the method is not readable. */
export async function handleArtifactRequest(
  req: IncomingMessage,
  res: ServerResponse,
  route: ArtifactRoute,
  deps: ArtifactRequestDeps,
): Promise<boolean> {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") return false;

  if (route.kind === "invalid") {
    send(res, method, 404, { "content-type": "text/plain; charset=utf-8" }, "Not found\n");
    return true;
  }
  if (route.kind === "index") {
    if (route.redirect) {
      // Relative Location, so the redirect keeps whatever host/port the request
      // arrived on. Query is carried over: `?format=json` must survive it.
      send(res, method, 301, { location: `artifacts/${route.json ? "?format=json" : ""}` }, "");
      return true;
    }
    const artifacts = await listArtifacts(deps);
    if (route.json) {
      send(
        res,
        method,
        200,
        { "content-type": "application/json", "cache-control": "no-store" },
        JSON.stringify(artifacts, null, 2),
      );
    } else {
      send(
        res,
        method,
        200,
        {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "content-security-policy": artifactCsp("text/html") ?? "",
        },
        renderArtifactIndex(artifacts),
      );
    }
    return true;
  }

  const file = await resolveArtifactFile({
    rootDir: deps.rootDir,
    project: route.project,
    name: route.name,
  });
  if (!file) {
    send(res, method, 404, { "content-type": "text/plain; charset=utf-8" }, "Not found\n");
    return true;
  }

  const contentType = contentTypeFor(route.name);
  if (!contentType) {
    send(res, method, 415, { "content-type": "text/plain; charset=utf-8" }, "Unsupported type\n");
    return true;
  }

  const info = await stat(file);
  const headers: Record<string, string> = {
    "content-type": contentType,
    "content-length": String(info.size),
    "last-modified": new Date(info.mtimeMs).toUTCString(),
    // Reports are regenerated in place; a cached copy silently shows a stale review.
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
  const csp = artifactCsp(contentType);
  if (csp) headers["content-security-policy"] = csp;

  const content = await readFile(file);
  send(res, method, 200, headers, content);
  return true;
}

function send(
  res: ServerResponse,
  method: string,
  status: number,
  headers: Record<string, string>,
  body: string | Buffer,
): void {
  res.writeHead(status, headers);
  res.end(method === "HEAD" ? undefined : body);
}

/**
 * Browsable index of everything published, newest first.
 *
 * Deliberately plain: no CSS and no script, because it must stay readable from
 * any host and this server exists to hand links out, not to look like the
 * reports it lists. Every `href` is relative to `/artifacts/`, which is why the
 * handler redirects `/artifacts` here — see `matchArtifactRoute`.
 */
export function renderArtifactIndex(artifacts: ArtifactRef[]): string {
  const rows = artifacts.length
    ? artifacts
        .map((artifact) => {
          const href = `${encodeURIComponent(artifact.project)}/${encodeURIComponent(artifact.name)}`;
          const when = new Date(artifact.updatedAt).toISOString().replace("T", " ").slice(0, 16);
          return [
            "    <li>",
            `      <a href="${escapeHtml(href)}">${escapeHtml(artifact.title)}</a>`,
            `      <br />`,
            `      <small>${escapeHtml(artifact.project)} · ${when} UTC · ${artifact.size} bytes</small>`,
            "    </li>",
          ].join("\n");
        })
        .join("\n")
    : "    <li><em>Nothing published yet.</em></li>";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Artifacts</title>
  </head>
  <body>
    <h1>Published artifacts</h1>
    <p>
      ${artifacts.length} file${artifacts.length === 1 ? "" : "s"} ·
      <a href="?format=json">json</a>
    </p>
    <ul>
${rows}
    </ul>
  </body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed escape is not a route we serve; the caller's segment check
    // rejects the raw form too.
    return value;
  }
}
