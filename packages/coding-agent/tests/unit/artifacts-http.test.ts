import { describe, it, expect } from "vitest";
import { artifactCsp, matchArtifactRoute, renderArtifactIndex } from "../../src/artifacts-http";
import { artifactNameFor, artifactUrl, isSafeSegment, projectSlug, type ArtifactRef } from "../../src/artifacts";

describe("matchArtifactRoute", () => {
  it("maps the index in either spelling", () => {
    expect(matchArtifactRoute("/artifacts")).toEqual({
      kind: "index",
      redirect: true,
      json: false,
    });
    expect(matchArtifactRoute("/artifacts/")).toEqual({
      kind: "index",
      redirect: false,
      json: false,
    });
    expect(matchArtifactRoute("/artifacts?limit=5")).toEqual({
      kind: "index",
      redirect: true,
      json: false,
    });
  });

  it("asks for JSON only through the format parameter", () => {
    expect(matchArtifactRoute("/artifacts/?format=json")).toEqual({
      kind: "index",
      redirect: false,
      json: true,
    });
    // The redirect has to carry the query or the parameter is lost.
    expect(matchArtifactRoute("/artifacts?format=json")).toEqual({
      kind: "index",
      redirect: true,
      json: true,
    });
    expect(matchArtifactRoute("/artifacts/?format=csv").json).toBe(false);
  });

  it("maps one project/name pair", () => {
    expect(matchArtifactRoute("/artifacts/ai-chatbot/review.html")).toEqual({
      kind: "file",
      project: "ai-chatbot",
      name: "review.html",
    });
    // Published names never carry spaces (`artifactNameFor` forbids them), so a
    // decoded space is not a name this server will ever have on disk.
    expect(matchArtifactRoute("/artifacts/ai-chatbot/a%20b.html")).toEqual({
      kind: "invalid",
    });
  });

  it("leaves everything outside /artifacts to the caller", () => {
    expect(matchArtifactRoute("/rpc")).toBeUndefined();
    expect(matchArtifactRoute("/artifactsfoo")).toBeUndefined();
    expect(matchArtifactRoute("/api/artifacts")).toBeUndefined();
    expect(matchArtifactRoute(undefined)).toBeUndefined();
  });

  it("rejects traversal and wrong depth under /artifacts", () => {
    expect(matchArtifactRoute("/artifacts/..")).toEqual({ kind: "invalid" });
    expect(matchArtifactRoute("/artifacts/../etc/passwd")).toEqual({ kind: "invalid" });
    expect(matchArtifactRoute("/artifacts/%2e%2e/root")).toEqual({ kind: "invalid" });
    expect(matchArtifactRoute("/artifacts/ai-chatbot/sub/deep.html")).toEqual({
      kind: "invalid",
    });
    expect(matchArtifactRoute("/artifacts/.hidden/x.html")).toEqual({ kind: "invalid" });
  });

  it("round-trips every name publishing can produce", () => {
    const hostile = [
      "/tmp/architecture-review-20260831-153639.html",
      "/tmp/../../escape <script>. HTM",
      "/tmp/日本語.md",
      "/tmp/...",
      "/tmp/..%2f..%2fpasswd.html",
      "/tmp/a b  c-report.html",
      "/tmp/no-extension",
    ];
    for (const sourcePath of hostile) {
      const project = projectSlug("/home/javier/projects/ai-chatbot");
      const name = artifactNameFor(sourcePath);
      expect(isSafeSegment(name), name).toBe(true);
      const url = new URL(artifactUrl("http://h:1", project, name));
      expect(matchArtifactRoute(url.pathname), name).toEqual({ kind: "file", project, name });
    }
  });

  it("survives a malformed percent escape without decoding it", () => {
    expect(matchArtifactRoute("/artifacts/ai-chatbot/%")).toEqual({ kind: "invalid" });
  });
});

describe("artifactCsp", () => {
  const html = artifactCsp("text/html; charset=utf-8") ?? "";
  const scriptSrc = html.split("; ").find((directive) => directive.startsWith("script-src"));

  it("is only set for HTML documents", () => {
    expect(artifactCsp("application/json")).toBeUndefined();
    expect(artifactCsp("image/png")).toBeUndefined();
  });

  it("allows the CDNs the report scaffold loads, in the shape it loads them", () => {
    // The scaffold is fixed: <script src="https://cdn.tailwindcss.com"> plus an
    // ESM import of mermaid from jsdelivr. Blocking either yields an unstyled
    // page with empty diagram slots, which reads as a broken report.
    expect(scriptSrc).toContain("https://cdn.tailwindcss.com");
    expect(scriptSrc).toContain("https://cdn.jsdelivr.net");
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'unsafe-eval'"); // Tailwind's Play CDN is a JIT
    expect(html).toContain("style-src 'unsafe-inline'"); // inline <style> + class attributes
  });

  it("still sandboxes the document itself", () => {
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain("form-action 'none'");
    expect(html).not.toContain("frame-src"); // no embedding third-party frames
  });
});

describe("renderArtifactIndex", () => {
  const artifact: ArtifactRef = {
    project: "ai-chatbot",
    name: "architecture-review-20260831-153639.html",
    title: 'Architecture review — "Coding" & <Agent>',
    url: "http://192.168.18.50:3015/artifacts/ai-chatbot/architecture-review-20260831-153639.html",
    size: 73108,
    updatedAt: Date.UTC(2026, 7, 31, 15, 36, 39),
  };

  it("links relatively, so any host can browse it", () => {
    // No absolute URL may leak in: the configured base is `localhost`, which is
    // not the host the user reaches this server on.
    const html = renderArtifactIndex([artifact]);
    expect(html).toContain(
      'href="ai-chatbot/architecture-review-20260831-153639.html"',
    );
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.every((h) => !/^(https?:)?\/\//.test(h))).toBe(true); // none absolute
    expect(html).not.toContain("localhost");
    expect(html).not.toContain(artifact.url);
  });

  it("escapes titles, which come from the document itself", () => {
    const html = renderArtifactIndex([artifact]);
    expect(html).toContain("Architecture review — &quot;Coding&quot; &amp; &lt;Agent&gt;");
    expect(html).not.toContain('<title>"Coding"');
  });

  it("is a valid document with the metadata a report list needs", () => {
    const html = renderArtifactIndex([artifact]);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("ai-chatbot · 2026-08-31 15:36 UTC · 73108 bytes");
    expect(html).toContain("?format=json");
  });

  it("says so when nothing has been published", () => {
    expect(renderArtifactIndex([])).toContain("Nothing published yet");
  });
});
