import "server-only";

import { append, completeStream } from "./registry";

/**
 * Builds the `consumeSseStream` callback passed to
 * `createUIMessageStreamResponse`: it reads the tee'd copy of the response's
 * already-encoded SSE stream and feeds every frame into the resume registry,
 * so generation and persistence survive a client disconnect (spec decision 2).
 *
 * The SDK invokes this callback fire-and-forget (it never awaits the returned
 * promise), so the loop must never reject: read errors are logged and
 * swallowed, and `completeStream` always runs in `finally` — the buffer then
 * ends with the terminal `data: [DONE]\n\n` the tee copy already received
 * (or, on a read error, is served as-is until TTL).
 *
 * Deliberately free of `@ai-sdk/*` imports: from here on the stream is plain
 * string chunks.
 */
export const createRegistrySseConsumer =
  (streamKey: string) =>
  async ({
    stream,
  }: {
    stream: ReadableStream<string>;
  }): Promise<void> => {
    const reader = stream.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        append(streamKey, value);
      }
    } catch (error) {
      console.error(
        "Resume tee: failed to consume the chat SSE stream:",
        error,
      );
    } finally {
      completeStream(streamKey);
    }
  };
