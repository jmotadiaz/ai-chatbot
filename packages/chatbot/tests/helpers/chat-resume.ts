import { clear } from "@/lib/features/chat/resume/registry";

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
 * Per-test reset for the registry's process-wide store. The store is anchored
 * on `globalThis`, so it outlives both a test file's module graph and the
 * `next dev` recompiles that motivated the anchor: each suite starts from an
 * empty registry explicitly instead of relying on module isolation.
 */
export function resetRegistry(): void {
  clear();
}
