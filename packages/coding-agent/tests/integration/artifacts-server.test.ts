import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  setTraceSessionId: () => {},
  runWithTraceContext: (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { startHttpTransport } = await import("../../src/transports/http");
const { publishArtifact } = await import("../../src/artifacts");

/**
 * The artifact route over the real worker server: an agent publishes a report
 * it generated in the temp directory, and a browser gets it back through the
 * same port that answers `POST /rpc`.
 */

const REPORT = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Architecture review — Coding Agent</title>
<script src="https://cdn.tailwindcss.com"></script>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
</script>
</head><body><h1>Candidates</h1></body></html>`;

let tmp: string;
let rootDir: string;
let baseUrl: string;
let server: ReturnType<typeof startHttpTransport>;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "artifacts-server-"));
  rootDir = path.join(tmp, "root");
  await mkdir(path.join(tmp, "generated"), { recursive: true });
  vi.stubEnv("CODING_AGENT_ARTIFACTS_DIR", rootDir);

  server = startHttpTransport({ port: 0, host: "127.0.0.1" });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  // The base the agent is shown, so the index and the published URLs point here.
  vi.stubEnv("CODING_AGENT_ARTIFACTS_URL", baseUrl);
});

afterAll(async () => {
  server?.close();
  vi.unstubAllEnvs();
  await rm(tmp, { recursive: true, force: true });
});

/** Publish the way the agent does, and return the URL it would show the user. */
async function publish(name: string): Promise<string> {
  const source = path.join(tmp, "generated", name);
  await writeFile(source, REPORT, "utf-8");
  const ref = await publishArtifact({
    sourcePath: source,
    rootDir,
    baseUrl: process.env.CODING_AGENT_ARTIFACTS_URL as string,
    cwd: "/home/javier/projects/ai-chatbot",
  });
  return ref.url;
}

describe("GET /artifacts on the worker", () => {
  it("serves a browsable index whose links work from any host", async () => {
    await publish("architecture-review-1.html");
    const res = await fetch(`${baseUrl}/artifacts`, { redirect: "manual" });
    expect(res.status).toBe(301);
    // Relative Location: the redirect must not rewrite the host the user came in on.
    expect(res.headers.get("location")).toBe("artifacts/");

    const page = await fetch(`${baseUrl}/artifacts/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");

    const html = await page.text();
    expect(html).toContain("Architecture review — Coding Agent");
    expect(html).toContain('href="ai-chatbot/architecture-review-1.html"');
    expect(html).not.toContain(baseUrl); // no absolute links in the page
  });

  it("keeps a machine-readable index behind ?format=json", async () => {
    const url = await publish("architecture-review-1b.html");
    const res = await fetch(`${baseUrl}/artifacts?format=json`);
    expect(res.status).toBe(200); // fetch followed the 301, query included
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.url).toBe(`${baseUrl}/artifacts/?format=json`);

    const listed = (await res.json()) as Array<{ url: string; title: string }>;
    expect(listed.map((a) => a.url)).toContain(url);
    expect(listed.find((a) => a.url === url)?.title).toBe("Architecture review — Coding Agent");
  });

  it("serves the report inline with a CSP that keeps the CDNs working", async () => {
    const url = await publish("architecture-review-2.html");
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");

    const csp = res.headers.get("content-security-policy") ?? "";
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src")) ?? "";
    for (const host of externalHosts(REPORT)) {
      expect(scriptSrc, `${host} must be allowed or the report renders broken`).toContain(host);
    }

    expect(await res.text()).toBe(REPORT);
  });

  it("answers HEAD without a body", async () => {
    const url = await publish("architecture-review-3.html");
    const res = await fetch(url, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(Number(res.headers.get("content-length"))).toBe(Buffer.byteLength(REPORT));
    expect(await res.text()).toBe("");
  });

  it("404s unknown files, escaped paths and non-artifact GETs", async () => {
    await publish("architecture-review-4.html");
    const missing = await fetch(`${baseUrl}/artifacts/ai-chatbot/nope.html`);
    expect(missing.status).toBe(404);

    for (const attempt of [
      "/artifacts/ai-chatbot/..%2F..%2F..%2F..%2Fetc%2Fpasswd",
      "/artifacts/ai-chatbot/%2e%2e/%2e%2e/root",
      "/artifacts/.hidden/report.html",
      "/artifacts/ai-chatbot/sub/deep.html",
    ]) {
      const res = await fetch(`${baseUrl}${attempt}`);
      expect(res.status, attempt).toBe(404);
    }

    expect((await fetch(`${baseUrl}/nothing-else`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/artifactsfoo`)).status).toBe(404);
  });

  it("keeps POST /rpc on the same server", async () => {
    const res = await fetch(`${baseUrl}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "getAvailableModels", params: {}, id: 1 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jsonrpc?: string; result?: { models: unknown[] } };
    expect(body.jsonrpc).toBe("2.0");
    expect(Array.isArray(body.result?.models)).toBe(true);
  });
});

/** Hosts a report fetches from, so the CSP is checked against the real scaffold. */
function externalHosts(html: string): string[] {
  const hosts = new Set<string>();
  for (const match of html.matchAll(/https?:\/\/([^/"'\s]+)/g)) hosts.add(match[1]);
  return [...hosts];
}

describe("artifact location from config", () => {
  it("reads the artifacts root and URL base from the environment", async () => {
    const { getArtifactsBaseUrl, getArtifactsDir } = await import("../../src/paths");
    expect(getArtifactsDir()).toBe(rootDir);
    expect(getArtifactsBaseUrl()).toBe(baseUrl);
  });

  it("falls back to the worker URL, then the package .pi dir", async () => {
    vi.stubEnv("CODING_AGENT_ARTIFACTS_URL", "");
    vi.stubEnv("CODING_AGENT_ARTIFACTS_DIR", "");
    vi.stubEnv("CODING_AGENT_WORKER_URL", "http://localhost:3999/");
    const { getArtifactsBaseUrl, getArtifactsDir } = await import("../../src/paths");
    expect(getArtifactsBaseUrl()).toBe("http://localhost:3999");
    expect(getArtifactsDir().endsWith(path.join(".pi", "artifacts"))).toBe(true);
  });
});
