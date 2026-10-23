import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * La config de tracing (enabled + dir) YA NO es `process.env` (ADR 0011): el
 * bundle `config` de test está congelado (`traceEnabled: false`, traceDir
 * `.pi-test/traces`), así que este test INYECTA su config mockeando el módulo
 * `"config"` — la fachada congelada se copia con los dos overrides que
 * necesita el test (un tmpdir por test). Antes mutaba
 * `process.env.TRACE_ENABLED/TRACE_DIR`, que el selector ignora desde el
 * ticket 01 (y era estado global heredable, la causa del incidente).
 */
const injected = vi.hoisted(() => ({ traceDir: "", traceEnabled: true }));

vi.mock("config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("config")>();
  return {
    ...actual,
    config: {
      ...actual.config,
      traceEnabled: () => injected.traceEnabled,
      traceDir: () => injected.traceDir,
    },
  };
});

let traceDir: string;

beforeEach(() => {
  traceDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-registry-"));
  injected.traceDir = traceDir;
  injected.traceEnabled = true;
});

const { acquireTraceSink, releaseTraceSink, retainTraceSink, traceSinkRefCount } =
  await import("tracing");

const runDir = (runId: string) =>
  path.join(traceDir, "coding-agent", fs.readdirSync(path.join(traceDir, "coding-agent"))
    .find((name) => name.endsWith(`_${runId.slice(0, 8)}`))!);

const lifecycleOf = (runId: string) =>
  fs.readFileSync(path.join(runDir(runId), "lifecycle.ndjson"), "utf8");

describe("trace sink registry", () => {
  it("shares one sink per run and closes it on the last release", async () => {
    const runId = "11111111-aaaa-4bbb-8ccc-dddddddddddd";
    const first = await acquireTraceSink({ runId, truncate: false });
    const second = await acquireTraceSink({ runId, truncate: false });

    expect(first).toBe(second);
    expect(traceSinkRefCount(runId)).toBe(2);

    await releaseTraceSink(runId);
    expect(traceSinkRefCount(runId)).toBe(1);

    await releaseTraceSink(runId);
    expect(traceSinkRefCount(runId)).toBe(0);
  });

  it("keeps writing after the acquiring request released, until the retained ref goes", async () => {
    const runId = "22222222-aaaa-4bbb-8ccc-dddddddddddd";
    const sink = await acquireTraceSink({ runId, truncate: false });
    // The detached turn takes its ref while the request still holds one.
    const releaseTurn = retainTraceSink(runId);

    // Request ends: without the retained ref this used to close the sink and
    // silently drop everything the turn logged afterwards.
    await releaseTraceSink(runId);

    sink!.write({
      timestamp: new Date().toISOString(),
      runId,
      layer: "worker",
      level: "info",
      eventName: "subagent.dispatch",
      payload: {},
    });
    await releaseTurn();

    expect(lifecycleOf(runId)).toContain("subagent.dispatch");
    expect(traceSinkRefCount(runId)).toBe(0);
  });

  it("drops writes once every holder released", async () => {
    const runId = "33333333-aaaa-4bbb-8ccc-dddddddddddd";
    const sink = await acquireTraceSink({ runId, truncate: false });
    const releaseTurn = retainTraceSink(runId);
    await releaseTraceSink(runId);
    await releaseTurn();

    sink!.write({
      timestamp: new Date().toISOString(),
      runId,
      layer: "worker",
      level: "info",
      eventName: "after.close",
      payload: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(fs.existsSync(path.join(runDir(runId), "lifecycle.ndjson"))).toBe(false);
  });

  it("releasing twice through the same retain handle is a no-op", async () => {
    const runId = "44444444-aaaa-4bbb-8ccc-dddddddddddd";
    await acquireTraceSink({ runId, truncate: false });
    const releaseTurn = retainTraceSink(runId);

    await releaseTurn();
    await releaseTurn();

    expect(traceSinkRefCount(runId)).toBe(1);
  });

  it("returns null and a no-op retain when tracing is disabled", async () => {
    // Inyección vía el mock del bundle: `config.traceEnabled()` → false.
    injected.traceEnabled = false;
    const runId = "55555555-aaaa-4bbb-8ccc-dddddddddddd";

    expect(await acquireTraceSink({ runId, truncate: false })).toBeNull();
    await expect(retainTraceSink(runId)()).resolves.toBeUndefined();
    expect(traceSinkRefCount(runId)).toBe(0);
  });
});
