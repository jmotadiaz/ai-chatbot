import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STREAM_TTL_MS,
  append,
  attach,
  completeStream,
  evict,
  get,
  getLatestByChat,
  markPersisted,
  register,
  resolveStreamKey,
  setChatId,
  type StreamSubscriber,
} from "@/lib/features/chat/resume/registry";

/** Subscribers never let a test hang on an unimplemented callback. */
function makeSubscriber(overrides: Partial<StreamSubscriber> = {}): StreamSubscriber {
  return { onChunk: () => {}, onEnd: () => {}, ...overrides };
}

describe("chat resume registry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    // Reset the module-level singleton: push the clock past every entry's
    // possible TTL (markPersisted refreshes it from "now") and sweep.
    vi.advanceTimersByTime(10 * STREAM_TTL_MS);
    evict();
    vi.useRealTimers();
  });

  describe("append & buffer order", () => {
    it("appends chunks in order, keeping the first chunk first", () => {
      register("k1");
      append("k1", 'data: {"type":"start","messageId":"m1"}\n\n');
      append("k1", 'data: {"type":"text-delta","delta":"hi"}\n\n');
      append("k1", "data: [DONE]\n\n");

      const snapshot = get("k1");
      expect(snapshot?.chunks).toEqual([
        'data: {"type":"start","messageId":"m1"}\n\n',
        'data: {"type":"text-delta","delta":"hi"}\n\n',
        "data: [DONE]\n\n",
      ]);
    });

    it("returns copies: mutating a snapshot does not touch the buffer", () => {
      register("k1");
      append("k1", 'data: {"type":"start"}\n\n');

      const snapshot = get("k1");
      snapshot?.chunks.push("data: [DONE]\n\n");

      expect(get("k1")?.chunks).toHaveLength(1);
    });

    it("appends to an unknown key without throwing", () => {
      expect(() => append("missing", "data: [DONE]\n\n")).not.toThrow();
    });

    it("appends to an expired key without throwing", () => {
      register("k1");
      vi.advanceTimersByTime(STREAM_TTL_MS + 1);
      evict();

      expect(() => append("k1", "data: [DONE]\n\n")).not.toThrow();
    });
  });

  describe("markPersisted", () => {
    it("flips state and does not evict or truncate the buffer", () => {
      register("k1");
      append("k1", 'data: {"type":"start"}\n\n');
      append("k1", 'data: {"type":"finish"}\n\n');

      markPersisted("k1");

      const snapshot = get("k1");
      expect(snapshot?.state).toBe("persisted");
      expect(snapshot?.chunks).toHaveLength(2);
    });

    it("is idempotent", () => {
      register("k1");
      append("k1", 'data: {"type":"start"}\n\n');

      markPersisted("k1");
      markPersisted("k1");

      expect(get("k1")?.state).toBe("persisted");
      expect(get("k1")?.chunks).toHaveLength(1);
    });

    it("does not throw on an unknown key", () => {
      expect(() => markPersisted("missing")).not.toThrow();
    });

    it("refreshes the TTL so a persisted stream stays replayable", () => {
      register("k1");
      append("k1", 'data: {"type":"start"}\n\n');
      vi.advanceTimersByTime(STREAM_TTL_MS / 2);
      markPersisted("k1");

      // Half the TTL elapsed before persisting; the refresh buys a full
      // new TTL window.
      vi.advanceTimersByTime(STREAM_TTL_MS / 2 + 1);
      expect(get("k1")).toBeDefined();

      vi.advanceTimersByTime(STREAM_TTL_MS - (STREAM_TTL_MS / 2 + 1));
      expect(get("k1")).toBeUndefined();
    });
  });

  describe("TTL eviction", () => {
    it("evicts an entry past STREAM_TTL_MS from register", () => {
      register("k1");
      setChatId("k1", "chat-1");
      append("k1", 'data: {"type":"start"}\n\n');

      vi.advanceTimersByTime(STREAM_TTL_MS + 1);
      evict();

      expect(get("k1")).toBeUndefined();
      expect(getLatestByChat("chat-1")).toBeUndefined();
    });

    it("evicts an entry whose TTL has exactly elapsed", () => {
      register("k1");
      vi.advanceTimersByTime(STREAM_TTL_MS);
      evict();

      expect(get("k1")).toBeUndefined();
    });

    it("expires an entry that never persists (clock starts at register)", () => {
      register("k1");
      append("k1", 'data: {"type":"start"}\n\n');

      vi.advanceTimersByTime(STREAM_TTL_MS + 1);
      evict();

      expect(get("k1")).toBeUndefined();
      expect(get("k1")?.state).toBeUndefined();
    });

    it("sweeps lazily: expiry is enforced by every public read", () => {
      register("k1");
      vi.advanceTimersByTime(STREAM_TTL_MS + 1);

      // No explicit evict(): get() itself must drop the expired entry.
      expect(get("k1")).toBeUndefined();
    });
  });

  describe("chatId index", () => {
    it("points at the last registered stream for the chat", () => {
      register("k1", { chatId: "chat-1" });
      append("k1", "data: k1\n\n");
      register("k2", { chatId: "chat-1" });
      append("k2", "data: k2\n\n");

      expect(getLatestByChat("chat-1")?.chunks).toEqual(["data: k2\n\n"]);
      // The first stream survives untouched under its own key.
      expect(get("k1")?.chunks).toEqual(["data: k1\n\n"]);
      expect(get("k2")?.chunks).toEqual(["data: k2\n\n"]);
    });

    it("makes an entry findable via setChatId after registering without one", () => {
      register("k1");

      expect(getLatestByChat("chat-1")).toBeUndefined();

      setChatId("k1", "chat-1");
      expect(getLatestByChat("chat-1")?.chunks).toEqual([]);
    });

    it("returns undefined for an unknown chat", () => {
      expect(getLatestByChat("nope")).toBeUndefined();
    });

    it("does not let an expired latest entry shadow a newer one", () => {
      register("k1", { chatId: "chat-1" });
      register("k2", { chatId: "chat-1" });
      vi.advanceTimersByTime(STREAM_TTL_MS + 1);
      evict();

      expect(getLatestByChat("chat-1")).toBeUndefined();
    });
  });

  describe("resolveStreamKey", () => {
    it("returns the segment itself when it is a live stream key", () => {
      register("k1");

      expect(resolveStreamKey("k1")).toBe("k1");
    });

    it("prefers the direct key hit over the chatId index", () => {
      register("k1", { chatId: "chat-1" });
      // Another stream whose chatId is literally the string "k1".
      register("k2", { chatId: "k1" });

      expect(resolveStreamKey("k1")).toBe("k1");
    });

    it("resolves a chatId to the latest stream key", () => {
      register("k1", { chatId: "chat-1" });
      register("k2", { chatId: "chat-1" });

      expect(resolveStreamKey("chat-1")).toBe("k2");
    });

    it("returns undefined for an unknown segment", () => {
      expect(resolveStreamKey("nope")).toBeUndefined();
    });

    it("returns undefined once the entry has expired", () => {
      register("k1");
      register("k2", { chatId: "chat-1" });
      vi.advanceTimersByTime(STREAM_TTL_MS + 1);

      expect(resolveStreamKey("k1")).toBeUndefined();
      expect(resolveStreamKey("chat-1")).toBeUndefined();
    });
  });

  describe("attach", () => {
    it("returns the buffer as snapshot, then delivers live appends, then onEnd once", () => {
      register("k1");
      append("k1", 'data: {"type":"start"}\n\n');
      append("k1", 'data: {"type":"text-delta","delta":"a"}\n\n');

      const chunks: string[] = [];
      let endCalls = 0;
      const snapshot = attach("k1", {
        onChunk: (chunk) => chunks.push(chunk),
        onEnd: () => {
          endCalls += 1;
        },
      });

      // The past is the returned snapshot; the subscriber only sees the tail.
      expect(snapshot?.chunks).toEqual([
        'data: {"type":"start"}\n\n',
        'data: {"type":"text-delta","delta":"a"}\n\n',
      ]);
      expect(chunks).toEqual([]);

      append("k1", 'data: {"type":"text-delta","delta":"b"}\n\n');
      expect(chunks).toEqual(['data: {"type":"text-delta","delta":"b"}\n\n']);

      completeStream("k1");
      expect(endCalls).toBe(1);

      // No further onEnd after completion, and appends stop notifying.
      append("k1", 'data: {"type":"text-delta","delta":"late"}\n\n');
      completeStream("k1");
      expect(endCalls).toBe(1);
      expect(chunks).toHaveLength(1);
    });

    it("returns the snapshot without registering when the stream is complete", () => {
      register("k1");
      append("k1", 'data: {"type":"start"}\n\n');
      append("k1", "data: [DONE]\n\n");
      completeStream("k1");

      const chunks: string[] = [];
      const snapshot = attach("k1", { onChunk: (c) => chunks.push(c), onEnd: () => {} });

      expect(snapshot?.complete).toBe(true);
      expect(snapshot?.chunks.at(-1)).toBe("data: [DONE]\n\n");

      // Buffer may still be appended to, but the subscriber is NOT registered.
      append("k1", 'data: {"type":"late"}\n\n');
      expect(chunks).toEqual([]);
    });

    it("returns null for a missing key and registers no subscriber", () => {
      expect(attach("missing", makeSubscriber())).toBeNull();
    });

    it("returns null for an expired key", () => {
      register("k1");
      vi.advanceTimersByTime(STREAM_TTL_MS + 1);
      evict();

      expect(attach("k1", makeSubscriber())).toBeNull();
    });

    it("notifies subscribers on eviction via onEnd", () => {
      register("k1");
      let endCalls = 0;
      attach("k1", makeSubscriber({ onEnd: () => (endCalls += 1) }));

      vi.advanceTimersByTime(STREAM_TTL_MS + 1);
      evict();

      expect(endCalls).toBe(1);
    });
  });

  describe("register (idempotent upsert)", () => {
    it("keeps the buffer and state of an existing entry", () => {
      register("k1");
      append("k1", 'data: {"type":"start"}\n\n');
      markPersisted("k1");

      register("k1");

      expect(get("k1")?.state).toBe("persisted");
      expect(get("k1")?.chunks).toEqual(['data: {"type":"start"}\n\n']);
    });

    it("refreshes the chatId index on re-register", () => {
      register("k1", { chatId: "chat-1" });
      setChatId("k1", "chat-2");

      expect(getLatestByChat("chat-1")).toBeUndefined();
      expect(getLatestByChat("chat-2")).toBeDefined();

      register("k1", { chatId: "chat-1" });
      expect(getLatestByChat("chat-1")).toBeDefined();
      expect(getLatestByChat("chat-2")).toBeUndefined();
    });

    it("does not throw for stream lifecycle calls on unknown keys", () => {
      expect(() => completeStream("missing")).not.toThrow();
      expect(() => setChatId("missing", "chat-1")).not.toThrow();
    });
  });

  describe("completeStream", () => {
    it("marks complete and forgets subscribers", () => {
      register("k1");
      const onEnd = vi.fn();
      attach("k1", makeSubscriber({ onEnd }));

      completeStream("k1");
      expect(get("k1")?.complete).toBe(true);
      expect(onEnd).toHaveBeenCalledTimes(1);

      // The buffer stays readable after completion until TTL.
      expect(get("k1")?.chunks).toHaveLength(0);
    });

    it("delivers onEnd once for multiple subscribers", () => {
      register("k1");
      const onEnd1 = vi.fn();
      const onEnd2 = vi.fn();
      attach("k1", makeSubscriber({ onEnd: onEnd1 }));
      attach("k1", makeSubscriber({ onEnd: onEnd2 }));

      completeStream("k1");

      expect(onEnd1).toHaveBeenCalledTimes(1);
      expect(onEnd2).toHaveBeenCalledTimes(1);
    });

    it("is idempotent and does not throw on an unknown key", () => {
      register("k1");
      const onEnd = vi.fn();
      attach("k1", makeSubscriber({ onEnd }));

      completeStream("k1");
      completeStream("k1");
      completeStream("missing");

      expect(onEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe("evict", () => {
    it("keeps non-expired entries and only sweeps expired ones", () => {
      register("k-old");
      vi.advanceTimersByTime(STREAM_TTL_MS + 1);
      register("k-fresh");

      evict();

      expect(get("k-old")).toBeUndefined();
      expect(get("k-fresh")).toBeDefined();
    });
  });
});
