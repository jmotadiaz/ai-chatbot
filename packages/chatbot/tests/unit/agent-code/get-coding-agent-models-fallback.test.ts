import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/features/auth/auth-config", () => ({
  auth: async () => ({ user: { id: "user-1" } }),
}));

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  FileTraceSink: class {
    async open() {}
    async close() {}
  },
  runWithTraceContext: <T>(_ctx: unknown, fn: () => Promise<T>) => fn(),
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async getAvailableModels() {
      throw new Error("connect ECONNREFUSED 127.0.0.1:3015");
    }
  },
}));

import { getCodingAgentModels } from "@/lib/features/code/actions";

describe("getCodingAgentModels error handling", () => {
  it("degrades gracefully to empty array when the worker is unreachable", async () => {
    const models = await getCodingAgentModels();
    expect(models).toEqual([]);
  });
});
