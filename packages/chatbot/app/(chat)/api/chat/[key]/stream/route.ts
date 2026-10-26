import { UI_MESSAGE_STREAM_HEADERS } from "ai";

import { withAuth } from "@/lib/features/auth/with-auth/handler";
import {
  attach,
  resolveStreamKey,
} from "@/lib/features/chat/resume/registry";

export const maxDuration = 240;

/**
 * The dynamic segment sits one level above `stream` in the pathname.
 * `withAuth` drops Next's `params` argument, so every dynamic route in this
 * repo parses the URL manually (see `[sessionId]/status/route.ts`).
 */
function getStreamKeyFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  // /api/chat/[key]/stream
  return decodeURIComponent(parts[parts.length - 2] ?? "");
}

/**
 * GET `/api/chat/[key]/stream` — the resume endpoint
 * `DefaultChatTransport.reconnectToStream` calls by default.
 *
 * `[key]` is either a per-turn `streamKey` or a `chatId` (resolved through
 * the registry's "latest stream per chat" index). With no live entry the
 * route answers `204`: the only "nothing to resume" signal the SDK client
 * understands silently (`reconnectToStream` returns null and the chat
 * settles to `ready` without an error toast).
 *
 * With a live entry the response replays the registry buffer verbatim — the
 * frames are already SSE-encoded (`data: {...}\n\n`), start with the original
 * `start` chunk (which makes the replay idempotent) and, once the turn has
 * ended, end with the tee's own `data: [DONE]\n\n`. While the turn is still
 * running, live frames are forwarded as they are appended, until the source
 * completes or the entry is evicted.
 */
export const GET = withAuth(async (_user, req) => {
  const keyOrChatId = getStreamKeyFromUrl(new URL(req.url));
  const streamKey = resolveStreamKey(keyOrChatId);
  if (!streamKey) {
    return new Response(null, { status: 204 });
  }

  const encoder = new TextEncoder();

  /**
   * The whole response-stream lifecycle in one place: everything the
   * `attach` subscriber, the `ReadableStream` callbacks and the two helpers
   * below coordinate on. The `controller`/`started` pair gates writing, the
   * `pending`/`pendingEnd` pair buffers what arrives before `start`, and
   * `cancelled` stops writing after the client goes away.
   */
  const relay = {
    controller: undefined as ReadableStreamDefaultController<Uint8Array> | undefined,
    started: false,
    cancelled: false,
    // Frames appended between `attach` and the stream's `start` (a defensive
    // guard: `append` is driven by a fire-and-forget async loop).
    pending: [] as string[],
    pendingEnd: false,
  };

  function closeQuietly(): void {
    try {
      relay.controller?.close();
    } catch {
      // Already closed; nothing left to do.
    }
  }

  function deliver(frame: string): void {
    if (!relay.started) {
      relay.pending.push(frame);
      return;
    }
    if (relay.cancelled || !relay.controller) return;
    try {
      relay.controller.enqueue(encoder.encode(frame));
    } catch {
      // The response stream is gone (client left); ignore further writes.
      relay.cancelled = true;
    }
  }

  // `attach` returns the buffered past AND registers the tailing subscriber
  // atomically, so no frame can slip between replay and tail. When the
  // snapshot is already complete the registry registers no subscriber and
  // the buffered `[DONE]` terminator closes the stream right after replay.
  const snapshot = attach(streamKey, {
    onChunk: deliver,
    onEnd: () => {
      if (!relay.started) {
        relay.pendingEnd = true;
        return;
      }
      if (relay.cancelled) return;
      closeQuietly();
    },
  });
  if (!snapshot) {
    return new Response(null, { status: 204 });
  }

  // A null snapshot would only be possible if the entry was evicted in the
  // microsecond between resolve and attach — handled above as 204.
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      relay.controller = streamController;
      relay.started = true;
      for (const frame of snapshot.chunks) {
        relay.controller.enqueue(encoder.encode(frame));
      }
      for (const frame of relay.pending) {
        relay.controller.enqueue(encoder.encode(frame));
      }
      relay.pending.length = 0;
      if (snapshot.complete || relay.pendingEnd) {
        closeQuietly();
      }
    },
    cancel() {
      // The client went away again; stop writing into a dead stream. The
      // generation itself keeps running: the registry's tee side is
      // independent of this response.
      relay.cancelled = true;
    },
  });

  return new Response(stream, { headers: UI_MESSAGE_STREAM_HEADERS });
});
