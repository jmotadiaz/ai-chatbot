import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  artifactViewPath,
  isSafeSegment,
  listArtifacts,
  projectSlug,
  publishArtifact,
  titleFromHtml,
} from "../../../src/artifacts/artifacts";

const REPORT = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Architecture review — Coding Agent · ai-chatbot</title>
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="bg-stone-50"><h1>Candidates</h1></body></html>`;

const SESSION_ID = "9f1c2e4a-0000-4000-8000-000000000001";
const CWD = "/home/javier/projects/ai-chatbot";

let tmp: string;
let rootDir: string;
let sourceDir: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "artifacts-test-"));
  rootDir = path.join(tmp, "root");
  sourceDir = path.join(tmp, "generated");
  await mkdir(sourceDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function htmlFile(name: string, content = REPORT): Promise<string> {
  const file = path.join(sourceDir, name);
  await writeFile(file, content, "utf-8");
  return file;
}

/** A folder that holds an `index.html`, as a skill could generate. */
async function artifactFolder(folder: string, content = REPORT): Promise<string> {
  const dir = path.join(sourceDir, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), content, "utf-8");
  return dir;
}

function publish(sourcePath: string, name: string, cwd = CWD) {
  return publishArtifact({ sourcePath, name, rootDir, sessionId: SESSION_ID, cwd });
}

describe("name and path helpers", () => {
  it("accepts ordinary artifact names and rejects unsafe ones", () => {
    expect(isSafeSegment("architecture-review")).toBe(true);
    expect(isSafeSegment("review.v2")).toBe(true);
    expect(isSafeSegment("..")).toBe(false);
    expect(isSafeSegment("a/b")).toBe(false);
    expect(isSafeSegment(".hidden")).toBe(false);
    expect(isSafeSegment("")).toBe(false);
  });

  it("uses the project directory name as the slug", () => {
    expect(projectSlug("/home/javier/projects/ai-chatbot")).toBe("ai-chatbot");
    expect(projectSlug("/home/x/my repo")).toBe("my-repo");
    expect(isSafeSegment(projectSlug("/.."))).toBe(true);
  });

  it("builds a Chatbot-relative view path with every segment encoded", () => {
    expect(artifactViewPath("ai-chatbot", SESSION_ID, "a b")).toBe(
      `/agent/code/ai-chatbot/${SESSION_ID}/artifacts/a%20b`,
    );
  });

  it("reads the report title for listings", () => {
    expect(titleFromHtml(REPORT)).toBe("Architecture review — Coding Agent · ai-chatbot");
    expect(titleFromHtml("<title>A <!--x--> &amp; B\n  v2</title>")).toBe("A B v2");
    expect(titleFromHtml("<h1>no title</h1>")).toBeUndefined();
  });
});

describe("publishArtifact: on-disk layout", () => {
  it("copies an .html file to <project>/<name>/index.html", async () => {
    const file = await htmlFile("architecture-review-20260831-153639.html");

    const ref = await publish(file, "architecture-review");

    const expected = path.join(rootDir, "ai-chatbot", "architecture-review", "index.html");
    expect(ref).toMatchObject({
      project: "ai-chatbot",
      name: "architecture-review",
      title: "Architecture review — Coding Agent · ai-chatbot",
      filePath: expected,
    });
    expect(await readFile(expected, "utf-8")).toBe(REPORT);
    expect(await readFile(file, "utf-8")).toBe(REPORT); // source left in place
  });

  it("copies an .htm file the same way", async () => {
    const file = await htmlFile("legacy.htm");
    await publish(file, "legacy");
    expect(await readFile(path.join(rootDir, "ai-chatbot", "legacy", "index.html"), "utf-8")).toBe(
      REPORT,
    );
  });

  it("copies the index.html of a folder", async () => {
    const dir = await artifactFolder("bundle", REPORT.replace("Candidates", "From folder"));

    const ref = await publish(dir, "bundle-view");

    expect(ref.title).toBe("Architecture review — Coding Agent · ai-chatbot");
    expect(
      await readFile(path.join(rootDir, "ai-chatbot", "bundle-view", "index.html"), "utf-8"),
    ).toContain("From folder");
  });

  it("falls back to the artifact name as the title when the document has none", async () => {
    const file = await htmlFile("notes.html", "<h1>No title here</h1>");
    const ref = await publish(file, "notes");
    expect(ref.title).toBe("notes");
  });

  it("groups artifacts by the project of the session cwd", async () => {
    const file = await htmlFile("review.html");
    await publish(file, "review", "/x/coding-agent");
    expect(existsSync(path.join(rootDir, "coding-agent", "review", "index.html"))).toBe(true);
  });
});

describe("publishArtifact: rejected input", () => {
  it("rejects a non-HTML file without writing anything", async () => {
    const file = path.join(sourceDir, "data.csv");
    await writeFile(file, "a,b\n1,2\n", "utf-8");

    await expect(publish(file, "data")).rejects.toThrow(/must be an \.html\/\.htm file/);
    expect(existsSync(rootDir)).toBe(false);
  });

  it("rejects a markdown file, since only HTML is published", async () => {
    const file = path.join(sourceDir, "notes.md");
    await writeFile(file, "# Notes\n", "utf-8");
    await expect(publish(file, "notes")).rejects.toThrow(/must be an \.html\/\.htm file/);
  });

  it("rejects a missing path with a readable message", async () => {
    await expect(publish(path.join(sourceDir, "gone.html"), "gone")).rejects.toThrow(
      /Artifact path not found/,
    );
  });

  it("rejects a directory that has no index.html", async () => {
    const dir = path.join(sourceDir, "empty");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "readme.html"), REPORT, "utf-8");

    await expect(publish(dir, "empty")).rejects.toThrow(/has no index\.html/);
  });

  it("rejects an unsafe artifact name before touching the disk", async () => {
    const file = await htmlFile("review.html");
    for (const name of ["../escape", "a/b", ".hidden", ""]) {
      await expect(publish(file, name), name).rejects.toThrow(/Invalid artifact name/);
    }
    expect(existsSync(rootDir)).toBe(false);
  });
});

describe("publishArtifact: overwrite in place", () => {
  it("overwrites <name>/index.html when the same name is published again", async () => {
    const file = await htmlFile("review.html");
    const first = await publish(file, "review");

    await writeFile(file, REPORT.replace("<h1>Candidates", "<h1>Revised"), "utf-8");
    const second = await publish(file, "review");

    expect(second.path).toBe(first.path);
    expect(second.filePath).toBe(first.filePath);
    expect(await readFile(second.filePath, "utf-8")).toContain("<h1>Revised");
    expect(await readdirNames(path.join(rootDir, "ai-chatbot"))).toEqual(["review"]);
  });

  it("publishing the already-published file itself keeps its content", async () => {
    const first = await publish(await htmlFile("review.html"), "review");
    const again = await publish(first.filePath, "review");
    expect(await readFile(again.filePath, "utf-8")).toBe(REPORT);
  });
});

describe("publishArtifact: returned path", () => {
  it("returns the Chatbot view path, not an absolute URL or worker port", async () => {
    const ref = await publish(await htmlFile("review.html"), "review");

    expect(ref.path).toBe(`/agent/code/ai-chatbot/${SESSION_ID}/artifacts/review`);
    expect(ref.path.startsWith("/agent/code/")).toBe(true);
    expect(ref.path).not.toMatch(/https?:|:3015|:3016/);
  });

  it("encodes project and session segments in the view path", async () => {
    const dir = path.join(tmp, "weird-session");
    const ref = await publishArtifact({
      sourcePath: await htmlFile("review.html"),
      name: "review",
      rootDir: dir,
      sessionId: "sess id/with slash",
      cwd: CWD,
    });
    expect(ref.path).toBe(
      "/agent/code/ai-chatbot/sess%20id%2Fwith%20slash/artifacts/review",
    );
  });
});

describe("listArtifacts", () => {
  it("returns nothing when nothing has been published yet", async () => {
    expect(await listArtifacts({ rootDir, sessionId: SESSION_ID })).toEqual([]);
  });

  it("lists <project>/<name> entries newest first, with view paths for the given session", async () => {
    await publish(await htmlFile("old.html"), "old", "/x/ai-chatbot");
    await publish(await htmlFile("fresh.html"), "fresh", "/x/coding-agent");
    // Make the ordering deterministic instead of trusting mtime granularity.
    const past = new Date(Date.now() - 60_000);
    await utimes(path.join(rootDir, "ai-chatbot", "old", "index.html"), past, past);

    const listed = await listArtifacts({ rootDir, sessionId: SESSION_ID });

    expect(listed.map((a) => `${a.project}/${a.name}`)).toEqual([
      "coding-agent/fresh",
      "ai-chatbot/old",
    ]);
    expect(listed[0]?.path).toBe(`/agent/code/coding-agent/${SESSION_ID}/artifacts/fresh`);
  });

  it("ignores loose files, dot folders and folders without index.html", async () => {
    await publish(await htmlFile("review.html"), "review");
    const projectDir = path.join(rootDir, projectSlug(CWD));
    await writeFile(path.join(projectDir, "stray.html"), REPORT, "utf-8");
    await mkdir(path.join(projectDir, "no-index"), { recursive: true });
    await mkdir(path.join(projectDir, ".hidden"), { recursive: true });
    await writeFile(path.join(projectDir, ".hidden", "index.html"), REPORT, "utf-8");

    const listed = await listArtifacts({ rootDir, sessionId: SESSION_ID });
    expect(listed.map((a) => a.name)).toEqual(["review"]);
  });
});

async function readdirNames(dir: string): Promise<string[]> {
  return (await readdir(dir)).sort();
}
