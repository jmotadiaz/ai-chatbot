import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setSubagentRunner,
  getSubagentRunner,
  type SubagentRunner,
} from "../../../../coding-agent/src/subagent-bridge";

const RUNNER_KEY = Symbol.for("codingAgent.subagentRunner");

type Bridge = typeof import("../../../../coding-agent/src/subagent-bridge");

/**
 * Resetting the module registry makes the next import re-evaluate the file,
 * standing in for the separate copy jiti hands the extension. The top-level
 * import bindings in this file keep pointing at the first instance.
 */
const importSecondInstance = async (): Promise<Bridge> => {
  vi.resetModules();
  return import("../../../../coding-agent/src/subagent-bridge");
};

const runner: SubagentRunner = async (_parentPiSessionId, toolCallId) => ({
  content: [{ type: "text", text: "ok" }],
  details: {
    subSessionId: "sub-1",
    subPiSessionId: "pi-sub-1",
    parentSessionId: "parent-1",
    parentToolCallId: toolCallId,
  },
});

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[RUNNER_KEY];
});

describe("subagent bridge", () => {
  it("returns undefined before the worker publishes a runner", () => {
    expect(getSubagentRunner()).toBeUndefined();
  });

  it("resolves the runner the worker published", async () => {
    setSubagentRunner(runner);
    const resolved = getSubagentRunner();
    expect(resolved).toBeDefined();
    const result = await resolved!("pi-parent", "tc-1", { task: "x" });
    expect(result.details.parentToolCallId).toBe("tc-1");
  });

  /**
   * The reason the bridge exists: Pi loads extensions through jiti, which
   * re-evaluates the module graph, so the extension holds a *different*
   * instance of this module than the worker. A fresh import stands in for
   * that second instance — it must still see the worker's runner.
   */
  it("shares the runner across separate module instances", async () => {
    setSubagentRunner(runner);

    const secondInstance = await importSecondInstance();

    expect(secondInstance.getSubagentRunner).not.toBe(getSubagentRunner);
    expect(secondInstance.getSubagentRunner()).toBe(runner);
  });

  it("does not leak state through module scope", async () => {
    const secondInstance = await importSecondInstance();
    secondInstance.setSubagentRunner(runner);

    // Published from the "extension" side, visible from the worker side.
    expect(getSubagentRunner()).toBe(runner);
  });
});
