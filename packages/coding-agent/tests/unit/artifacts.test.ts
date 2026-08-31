import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  artifactNameFor,
  artifactUrl,
  contentTypeFor,
  isSafeSegment,
  isTempArtifactPath,
  listArtifacts,
  projectSlug,
  publishArtifact,
  resolveArtifactFile,
  titleFromHtml,
} from "../../src/artifacts";

const REPORT = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Architecture review — Coding Agent · ai-chatbot</title>
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="bg-stone-50"><h1>Candidates</h1></body></html>`;

let tmp: string;
let rootDir: string;
let sourceDir: string;
const baseUrl = "http://localhost:3015";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "artifacts-test-"));
  rootDir = path.join(tmp, "root");
  sourceDir = path.join(tmp, "generated");
  await mkdir(sourceDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function source(name: string, content = REPORT): Promise<string> {
  const file = path.join(sourceDir, name);
  await writeFile(file, content, "utf-8");
  return file;
}

describe("artifact naming", () => {
  it("keeps the timestamped name a skill generated", () => {
    expect(artifactNameFor("/tmp/architecture-review-20260831-153639.html")).toBe(
      "architecture-review-20260831-153639.html",
    );
  });

  it("sanitizes names that could not be served back", async () => {
    const nasty = await source("../../evil <script>. HTM");
    const name = artifactNameFor(nasty);
    expect(isSafeSegment(name)).toBe(true);
    // The extension survives its own cleanup: serving this as .txt would show
    // the report as source instead of rendering it.
    expect(name).toBe("evil-script.htm");
  });

  it("always produces a safe segment, even for names that are all junk", () => {
    expect(isSafeSegment(artifactNameFor("/tmp/日本語.html"))).toBe(true);
    expect(artifactNameFor("/tmp/...")).toBe("artifact.txt");
    expect(artifactNameFor("/tmp/no-extension")).toBe("no-extension.txt");
  });

  it("uses the project directory name as the slug", () => {
    expect(projectSlug("/home/javier/projects/ai-chatbot")).toBe("ai-chatbot");
    expect(projectSlug("/home/x/my repo")).toBe("my-repo");
    expect(isSafeSegment(projectSlug("/.."))).toBe(true);
  });

  it("builds URLs that round-trip through decodeURIComponent", () => {
    const url = artifactUrl(`${baseUrl}/`, "ai-chatbot", "a b.html");
    expect(url).toBe(`${baseUrl}/artifacts/ai-chatbot/a%20b.html`);
  });

  it("knows the types the viewer renders inline", () => {
    expect(contentTypeFor("report.HTML")).toBe("text/html; charset=utf-8");
    expect(contentTypeFor("notes.md")).toBe("text/markdown; charset=utf-8");
    expect(contentTypeFor("model.bin")).toBeUndefined();
  });
});

describe("isTempArtifactPath", () => {
  it("matches HTML and markdown written to the temp dir", () => {
    expect(isTempArtifactPath("/tmp/chapter.html", "/tmp")).toBe(true);
    expect(isTempArtifactPath("/tmp/lesson.md", "/tmp")).toBe(true);
  });

  it("ignores files inside the repository", () => {
    expect(isTempArtifactPath("/repo/app/page.html", "/tmp")).toBe(false);
    expect(isTempArtifactPath("/tmp/data.csv", "/tmp")).toBe(false);
  });
});

describe("titleFromHtml", () => {
  it("reads the report title for the index", () => {
    expect(titleFromHtml(REPORT)).toBe("Architecture review — Coding Agent · ai-chatbot");
  });

  it("tolerates markup and entities inside the title", () => {
    expect(titleFromHtml("<title>A <!--x--> &amp; B\n  v2</title>")).toBe("A B v2");
    expect(titleFromHtml("<h1>no title</h1>")).toBeUndefined();
  });
});

describe("publishArtifact", () => {
  it("copies a temp report into the artifacts root and returns its URL", async () => {
    const file = await source("architecture-review-20260831-153639.html");
    const ref = await publishArtifact({
      sourcePath: file,
      rootDir,
      baseUrl,
      cwd: "/home/javier/projects/ai-chatbot",
    });

    expect(ref).toMatchObject({
      project: "ai-chatbot",
      name: "architecture-review-20260831-153639.html",
      title: "Architecture review — Coding Agent · ai-chatbot",
      url: `${baseUrl}/artifacts/ai-chatbot/architecture-review-20260831-153639.html`,
    });
    expect(await readFile(file, "utf-8")).toBe(REPORT); // source left in place
    expect(existsSync(path.join(rootDir, "ai-chatbot", ref.name))).toBe(true);
  });

  it("is idempotent: republishing an unchanged file reuses the same URL", async () => {
    const file = await source("review.html");
    const first = await publishArtifact({ sourcePath: file, rootDir, baseUrl });
    const second = await publishArtifact({ sourcePath: file, rootDir, baseUrl });

    expect(second.url).toBe(first.url);
    expect(await readdir(path.join(rootDir, first.project))).toHaveLength(1);
  });

  it("keeps the previous version when the name is taken by different content", async () => {
    const file = await source("review.html");
    const first = await publishArtifact({ sourcePath: file, rootDir, baseUrl });
    await writeFile(file, REPORT.replace("<h1>Candidates", "<h1>Revised"), "utf-8");
    const second = await publishArtifact({ sourcePath: file, rootDir, baseUrl });

    expect(second.url).not.toBe(first.url);
    expect(second.name).toMatch(/^review-[0-9a-f]{8}\.html$/);
    const published = await readdir(path.join(rootDir, first.project));
    expect(published).toHaveLength(2);
    expect(await readFile(path.join(rootDir, first.project, first.name), "utf-8")).toBe(REPORT);
  });

  it("honors an explicit title over the document's own", async () => {
    const file = await source("review.html");
    const ref = await publishArtifact({ sourcePath: file, rootDir, baseUrl, title: "Deepening" });
    expect(ref.title).toBe("Deepening");
  });

  it("falls back to the file name when the document has no title", async () => {
    const file = await source("notes.md", "# Notes\n");
    const ref = await publishArtifact({ sourcePath: file, rootDir, baseUrl });
    expect(ref.title).toBe("notes.md");
    expect(ref.name).toBe("notes.md");
  });

  it("reports a missing source instead of throwing into the agent loop", async () => {
    await expect(
      publishArtifact({ sourcePath: path.join(sourceDir, "gone.html"), rootDir, baseUrl }),
    ).rejects.toThrow(/Artifact source not found/);
  });
});

describe("listArtifacts", () => {
  it("returns nothing when nothing has been published yet", async () => {
    expect(await listArtifacts({ rootDir, baseUrl })).toEqual([]);
  });

  it("groups by project, newest first, with titles and URLs", async () => {
    const old = await source("old.html");
    const fresh = await source("fresh.html");
    await publishArtifact({ sourcePath: old, rootDir, baseUrl, cwd: "/x/ai-chatbot" });
    await publishArtifact({ sourcePath: fresh, rootDir, baseUrl, cwd: "/x/coding-agent" });
    // Make the ordering deterministic instead of trusting mtime granularity.
    const stale = path.join(rootDir, "ai-chatbot", "old.html");
    const past = new Date(Date.now() - 60_000);
    await utimes(stale, past, past);

    const listed = await listArtifacts({ rootDir, baseUrl });
    expect(listed.map((a) => a.project)).toEqual(["coding-agent", "ai-chatbot"]);
    expect(listed[1]?.title).toContain("Architecture review");
    expect(listed[0]?.url).toBe(`${baseUrl}/artifacts/coding-agent/fresh.html`);
  });

  it("skips dotfiles and types the viewer cannot render", async () => {
    await publishArtifact({ sourcePath: await source("review.html"), rootDir, baseUrl });
    const projectDir = path.join(rootDir, projectSlug());
    await writeFile(path.join(projectDir, ".hidden.html"), REPORT, "utf-8");
    await writeFile(path.join(projectDir, "payload.bin"), "x", "utf-8");

    const listed = await listArtifacts({ rootDir, baseUrl });
    expect(listed.map((a) => a.name)).toEqual(["review.html"]);
  });
});

describe("resolveArtifactFile", () => {
  it("resolves a published file", async () => {
    const ref = await publishArtifact({
      sourcePath: await source("review.html"),
      rootDir,
      baseUrl,
    });
    const file = await resolveArtifactFile({ rootDir, project: ref.project, name: ref.name });
    expect(file).toBe(path.join(rootDir, ref.project, ref.name));
  });

  it("refuses to climb out of the artifacts root", async () => {
    const escape = await resolveArtifactFile({
      rootDir,
      project: "..",
      name: "../../etc/passwd",
    });
    expect(escape).toBeUndefined();

    const encoded = await resolveArtifactFile({ rootDir, project: "..", name: "passwd" });
    expect(encoded).toBeUndefined();
  });

  it("refuses a name that is not a single safe segment", async () => {
    expect(
      await resolveArtifactFile({ rootDir, project: "ai-chatbot", name: "a/b" }),
    ).toBeUndefined();
    expect(
      await resolveArtifactFile({ rootDir, project: "ai-chatbot", name: ".hidden" }),
    ).toBeUndefined();
  });
});
