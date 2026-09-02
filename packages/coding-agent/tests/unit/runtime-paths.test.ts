import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import {
  PACKAGE_ROOT,
  getArtifactsDir,
  getCodingAgentDir,
  getSessionsDir,
} from "../../src/runtime/paths";
import { getAuthJsonPath } from "../../src/runtime/models";
import { getPiPackagesDir } from "../../src/runtime/pi-packages";

/**
 * Per-Entorno Pi runtime isolation (ticket 04, ADR 0002 v2): dev/test point at
 * their isolated `.pi-dev`/`.pi-test` dirs; prod keeps its current absolute
 * literals. Relative overrides must anchor to the worker package, never the
 * cwd, which varies between the worker, the chatbot and the test runners.
 */
describe("per-Entorno Pi runtime paths", () => {
  const KEYS = [
    "CODING_AGENT_AGENT_DIR",
    "CODING_AGENT_AUTH_JSON",
    "CODING_AGENT_ARTIFACTS_DIR",
    "CODING_AGENT_SESSIONS_DIR",
    "CODING_AGENT_PI_PACKAGES_DIR",
  ] as const;
  const saved: Record<string, string | undefined> = {};
  for (const key of KEYS) saved[key] = process.env[key];

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function setEntorno(env: "dev" | "test"): void {
    const dir = `.pi-${env}`;
    process.env.CODING_AGENT_AGENT_DIR = `${dir}/agent`;
    process.env.CODING_AGENT_AUTH_JSON = `${dir}/auth.json`;
    process.env.CODING_AGENT_ARTIFACTS_DIR = `${dir}/artifacts`;
    process.env.CODING_AGENT_SESSIONS_DIR = `${dir}/sessions`;
    process.env.CODING_AGENT_PI_PACKAGES_DIR = `${dir}/packages`;
  }

  it("resolves every dev override inside packages/coding-agent/.pi-dev", () => {
    setEntorno("dev");
    expect(getCodingAgentDir()).toBe(path.join(PACKAGE_ROOT, ".pi-dev", "agent"));
    expect(getAuthJsonPath()).toBe(path.join(PACKAGE_ROOT, ".pi-dev", "auth.json"));
    expect(getArtifactsDir()).toBe(path.join(PACKAGE_ROOT, ".pi-dev", "artifacts"));
    expect(getSessionsDir()).toBe(path.join(PACKAGE_ROOT, ".pi-dev", "sessions"));
    expect(getPiPackagesDir()).toBe(path.join(PACKAGE_ROOT, ".pi-dev", "packages"));
  });

  it("resolves every test override inside packages/coding-agent/.pi-test", () => {
    setEntorno("test");
    expect(getCodingAgentDir()).toBe(path.join(PACKAGE_ROOT, ".pi-test", "agent"));
    expect(getAuthJsonPath()).toBe(path.join(PACKAGE_ROOT, ".pi-test", "auth.json"));
    expect(getArtifactsDir()).toBe(path.join(PACKAGE_ROOT, ".pi-test", "artifacts"));
    expect(getSessionsDir()).toBe(path.join(PACKAGE_ROOT, ".pi-test", "sessions"));
    expect(getPiPackagesDir()).toBe(path.join(PACKAGE_ROOT, ".pi-test", "packages"));
  });

  it("never lets dev and test share a runtime dir", () => {
    setEntorno("dev");
    const dev = [
      getCodingAgentDir(),
      getAuthJsonPath(),
      getArtifactsDir(),
      getSessionsDir(),
      getPiPackagesDir(),
    ];
    setEntorno("test");
    const test = [
      getCodingAgentDir(),
      getAuthJsonPath(),
      getArtifactsDir(),
      getSessionsDir(),
      getPiPackagesDir(),
    ];
    expect(dev).toHaveLength(test.length);
    for (const [d, t] of dev.map((value, i) => [value, test[i]] as const)) {
      expect(d).not.toBe(t);
    }
  });

  it("leaves prod's absolute literals untouched (continuity, ADR 0002 v2)", () => {
    // Prod keeps the absolute values it runs with today; resolution must not
    // rewrite them relative to the package.
    process.env.CODING_AGENT_SESSIONS_DIR = "/home/javier/coding-agent/sessions";
    process.env.CODING_AGENT_AUTH_JSON = "/home/javier/coding-agent/auth.json";
    expect(getSessionsDir()).toBe("/home/javier/coding-agent/sessions");
    expect(getAuthJsonPath()).toBe("/home/javier/coding-agent/auth.json");
  });

  it("defaults auth.json to the worker-owned agent dir, never ~/.pi/agent", () => {
    delete process.env.CODING_AGENT_AUTH_JSON;
    delete process.env.CODING_AGENT_AGENT_DIR;
    const auth = getAuthJsonPath();
    expect(auth).toBe(path.join(PACKAGE_ROOT, ".pi", "agent", "auth.json"));
    expect(auth.startsWith(path.join(os.homedir(), ".pi"))).toBe(false);
  });

  it("treats empty overrides as unset (Playwright forwards empty strings)", () => {
    for (const key of KEYS) process.env[key] = "";
    expect(getCodingAgentDir()).toBe(path.join(PACKAGE_ROOT, ".pi", "agent"));
    expect(getArtifactsDir()).toBe(path.join(PACKAGE_ROOT, ".pi", "artifacts"));
    expect(getSessionsDir()).toBe(path.join(PACKAGE_ROOT, ".pi", "sessions"));
    expect(getPiPackagesDir()).toBe(path.join(PACKAGE_ROOT, ".pi", "packages"));
  });
});
