import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const originalEnv = { ...process.env };
let traceDir: string;

beforeEach(() => {
  traceDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-registry-"));
  process.env.TRACE_ENABLED = "1";
  process.env.TRACE_DIR = traceDir;
});

afterEach(() => {
  process.env.TRACE_ENABLED = originalEnv.TRACE_ENABLED;
  process.env.TRACE_DIR = originalEnv.TRACE_DIR;
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
    process.env.TRACE_ENABLED = "0";
    const runId = "55555555-aaaa-4bbb-8ccc-dddddddddddd";

    expect(await acquireTraceSink({ runId, truncate: false })).toBeNull();
    await expect(retainTraceSink(runId)()).resolves.toBeUndefined();
    expect(traceSinkRefCount(runId)).toBe(0);
  });
});
