import { describe, expect, it } from "vitest";
import { EmbeddingRateLimiter } from "@/lib/features/rag/ingestion/rate-limiter";

/**
 * The ingestion feature exercises this limiter through its singleton on every
 * batch (see `tests/unit/rag/ingestion.test.ts`), but the singleton's budget
 * (2000 inputs / 350k tokens per minute) is far above any reasonable fixture, so
 * its blocking branch would need a real minute to show up.
 *
 * These tests use the smallest justified window and an explicit clock that the
 * test advances — no arbitrary sleep of the production window. The only real
 * time spent is the limiter's own 100 ms poll tick, which is what the
 * implementation does while waiting.
 */

describe("EmbeddingRateLimiter", () => {
  it("executes without waiting while both budgets have room", async () => {
    const clock = { now: 0 };
    const limiter = new EmbeddingRateLimiter({
      maxRequestsPerMinute: 2,
      maxTokensPerMinute: 4,
      now: () => clock.now,
    });

    const executed: string[] = [];
    await limiter.execute(["aaaa"], async () => {
      executed.push("first");
    });
    await limiter.execute(["bbbb"], async () => {
      executed.push("second");
    });

    expect(executed).toEqual(["first", "second"]);
    expect(clock.now).toBe(0);
  });

  it("blocks a request over the token budget until the window expires", async () => {
    const clock = { now: 0 };
    const limiter = new EmbeddingRateLimiter({
      maxRequestsPerMinute: 10,
      // 8 characters ≈ 2 tokens, so a second identical request does not fit.
      maxTokensPerMinute: 2,
      windowMs: 60_000,
      now: () => clock.now,
    });

    const executedAt: number[] = [];
    await limiter.execute(["abcdefgh"], async () => {
      executedAt.push(clock.now);
    });

    const pending = limiter.execute(["abcdefgh"], async () => {
      executedAt.push(clock.now);
    });

    // The second call is waiting on the limiter's poll loop. Advance the clock
    // past the window instead of sleeping for it: the next poll releases it.
    clock.now = 60_001;
    await pending;

    expect(executedAt).toEqual([0, 60_001]);
  });

  it("blocks a request over the request-count budget until the window expires", async () => {
    const clock = { now: 0 };
    const limiter = new EmbeddingRateLimiter({
      maxRequestsPerMinute: 1,
      maxTokensPerMinute: 1000,
      windowMs: 60_000,
      now: () => clock.now,
    });

    const executedAt: number[] = [];
    await limiter.execute(["a"], async () => {
      executedAt.push(clock.now);
    });

    const pending = limiter.execute(["b"], async () => {
      executedAt.push(clock.now);
    });

    clock.now = 60_001;
    await pending;

    expect(executedAt).toEqual([0, 60_001]);
  });
});
