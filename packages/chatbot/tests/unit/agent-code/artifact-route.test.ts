/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const authState = vi.hoisted(() => ({ session: { user: { id: "user-1" } } as any }));

vi.mock("@/lib/features/auth/cached-auth", () => ({
  getSession: vi.fn(async () => authState.session),
}));

const state = vi.hoisted(() => ({
  artifactsDir: "",
  enabled: true,
}));

vi.mock("config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("config")>();
  return {
    ...actual,
    config: {
      codingAgentEnabled: () => state.enabled,
      codingAgentArtifactsDir: () => state.artifactsDir,
    },
  };
});

import { GET } from "@/app/(chat)/api/agent/code/[project]/artifacts/[artifact]/route";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "artifacts-"));
  state.artifactsDir = root;
  state.enabled = true;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("GET /api/agent/code/[project]/artifacts/[artifact]", () => {
  it("returns 401 when unauthenticated", async () => {
    const prev = authState.session;
    authState.session = null as any;
    const res = await GET(new Request("http://test/api/agent/code/p/artifacts/a"));
    expect(res.status).toBe(401);
    authState.session = prev;
  });

  it("returns 404 when coding agent disabled", async () => {
    state.enabled = false;
    const res = await GET(new Request("http://test/api/agent/code/p/artifacts/a"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for unsafe segments", async () => {
    const res = await GET(new Request("http://test/api/agent/code/../artifacts/a"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when artifact file does not exist", async () => {
    const res = await GET(new Request("http://test/api/agent/code/p/artifacts/a"));
    expect(res.status).toBe(404);
  });

  it("returns 200 with correct headers for existing artifact", async () => {
    const dir = path.join(root, "p", "a");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), "<html><body>hi</body></html>");

    const res = await GET(new Request("http://test/api/agent/code/p/artifacts/a"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("https://cdn.tailwindcss.com");
    expect(csp).toContain("https://cdn.jsdelivr.net");
    expect(csp).toContain("https://unpkg.com");
    expect(csp).toContain("default-src 'none'");
    const body = await res.text();
    expect(body).toContain("hi");
  });
});
