import { describe, expect, it, vi } from "vitest";
import { createRetryingFetch } from "../../src/retrying-fetch";

const response = (status: number) => new Response("{}", { status });

describe("createRetryingFetch", () => {
  it("retries 5xx responses until one succeeds", async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(200));
    const fetchImpl = createRetryingFetch(base as unknown as typeof fetch, {
      retries: 3,
      baseDelayMs: 0,
      sleep: async () => {},
    });

    const result = await fetchImpl("https://example.com");

    expect(result.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("returns the last 5xx response once retries are exhausted", async () => {
    const base = vi.fn().mockResolvedValue(response(503));
    const fetchImpl = createRetryingFetch(base as unknown as typeof fetch, {
      retries: 2,
      baseDelayMs: 0,
      sleep: async () => {},
    });

    const result = await fetchImpl("https://example.com");

    expect(result.status).toBe(503);
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("does not retry 4xx responses", async () => {
    const base = vi.fn().mockResolvedValue(response(404));
    const fetchImpl = createRetryingFetch(base as unknown as typeof fetch, {
      retries: 3,
      baseDelayMs: 0,
      sleep: async () => {},
    });

    const result = await fetchImpl("https://example.com");

    expect(result.status).toBe(404);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("does not retry when the request was aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const base = vi.fn().mockResolvedValue(response(503));
    const fetchImpl = createRetryingFetch(base as unknown as typeof fetch, {
      retries: 3,
      baseDelayMs: 0,
      sleep: async () => {},
    });

    const result = await fetchImpl("https://example.com", {
      signal: controller.signal,
    });

    expect(result.status).toBe(503);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("backs off exponentially between attempts", async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = createRetryingFetch(base as unknown as typeof fetch, {
      retries: 3,
      baseDelayMs: 500,
      sleep,
    });

    await fetchImpl("https://example.com");

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000]);
  });
});
