import { vi } from "vitest";

import { STREAM_TTL_MS, evict } from "@/lib/features/chat/resume/registry";

/**
 * Shared scaffolding for the chat-resume contract suites
 * (`tests/contract/chat/get-stream-route.test.ts`,
 * `post-route-registry-feed.test.ts`,
 * `post-route-resume-persistence.test.ts`). Deliberately small: only the
 * pieces those suites genuinely duplicate live here — everything suite
 * specific stays in the suite file.
 */

/**
 * Module stub for `@/lib/features/auth/with-auth/handler`: passes the
 * handler through with a synthetic `{ id }` user, so the route runs without
 * the real session machinery. Import it inside the `vi.mock` factory:
 *
 * ```ts
 * vi.mock("@/lib/features/auth/with-auth/handler", async () => {
 *   const { withAuthStub } = await import("../../helpers/chat-resume");
 *   return withAuthStub("user-1");
 * });
 * ```
 */
export function withAuthStub(userId: string) {
  return {
    withAuth:
      <T>(handler: T) =>
      async (req: Request) =>
        (handler as never as (user: { id: string }, req: Request) => Promise<Response>)(
          { id: userId },
          req,
        ),
  };
}

/** Module stub for `tracing`: deterministic ids, pass-through context. */
export const tracingStub = {
  newRequestId: () => "req-1",
  runWithTraceContext: <T>(_ctx: unknown, fn: () => Promise<T>) => fn(),
};

/**
 * Split an SSE body into its `data: ` frames in order, dropping frame
 * separators and anything that is not a data frame (comments, `event:` …).
 */
export function parseSseFrames(text: string): string[] {
  return text.split("\n\n").filter((frame) => frame.startsWith("data: "));
}

/**
 * The per-test reset for the registry's module-level singleton: pushes the
 * fake-timer clock past every entry's possible TTL (`markPersisted` refreshes
 * it from "now", hence the 10x margin) and lets the lazy sweep drop them.
 * Call from `afterEach` while `vi.useFakeTimers()` is still active; pair with
 * `vi.useRealTimers()` right after.
 */
export function sweepRegistry(): void {
  vi.advanceTimersByTime(10 * STREAM_TTL_MS);
  evict();
}
