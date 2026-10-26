import "server-only";

/**
 * Process-wide in-memory registry of resumable chat streams (spec decision 1).
 *
 * The POST route tees its SSE stream into this registry via
 * `consumeSseStream`, so a turn's generation and persistence survive a client
 * disconnect; the GET resume route replays the buffered frames. Single-process
 * by design (pm2 serves one chatbot process): no Redis, no `globalThis` — the
 * module-level `Map` IS the registry, like `lib/infrastructure/ai/catalog.ts`.
 *
 * Entries are keyed by `streamKey` (one per turn, client-generated), with a
 * secondary "latest stream per `chatId`" index so a remount without the
 * turn's key can still find the in-flight stream. Expiry is a lazy TTL sweep
 * (no timers): every public function sweeps first, so tests can drive the
 * clock with `vi.setSystemTime`.
 */

/** Time a stream stays replayable, from `register` or the last `markPersisted`. */
export const STREAM_TTL_MS = 60 * 60 * 1000; // 60 min

export type StreamState = "streaming" | "persisted";

export interface StreamSnapshot {
  /** SSE frames exactly as they arrived, in order. */
  chunks: string[];
  state: StreamState;
  /** The source closed: the terminal `data: [DONE]\n\n` is in `chunks`. */
  complete: boolean;
}

export interface StreamSubscriber {
  onChunk: (chunk: string) => void;
  onEnd: () => void;
}

interface RegistryEntry {
  chunks: string[];
  state: StreamState;
  complete: boolean;
  expiresAt: number;
  chatId?: string;
  /** Present while live; forgotten by `completeStream` or eviction. */
  subscribers: StreamSubscriber[];
}

const streams = new Map<string, RegistryEntry>();

/** Latest registered stream per chatId (updated by `register` / `setChatId`). */
const latestByChat = new Map<string, string>();

/**
 * Bind `entry` to `chatId` and refresh the latest-by-chat index. The old
 * index slot (when it still points at this key) falls back to the most
 * recently registered stream still bound to the previous chatId, so a
 * re-binding never leaves a dangling pointer.
 */
function bindChatId(entry: RegistryEntry, key: string, chatId: string): void {
  const previous = entry.chatId;
  if (previous && previous !== chatId && latestByChat.get(previous) === key) {
    latestByChat.delete(previous);
    // Map iteration is registration order: the last match is the latest.
    // Skip this key — its chatId is still the old one until re-assigned below.
    for (const [otherKey, otherEntry] of streams) {
      if (otherKey !== key && otherEntry.chatId === previous) {
        latestByChat.set(previous, otherKey);
      }
    }
  }
  entry.chatId = chatId;
  latestByChat.set(chatId, key);
}

function snapshotOf(entry: RegistryEntry): StreamSnapshot {
  return {
    chunks: [...entry.chunks],
    state: entry.state,
    complete: entry.complete,
  };
}

/**
 * Drop every expired entry, giving its subscribers a final `onEnd` (the
 * stream they were tailing is gone). Lazy: called at the top of every public
 * function; there is no timer.
 */
export function evict(): void {
  const now = Date.now();
  for (const [key, entry] of streams) {
    if (entry.expiresAt > now) continue;

    for (const subscriber of entry.subscribers) {
      try {
        subscriber.onEnd();
      } catch {
        // A misbehaving subscriber must not break the sweep.
      }
    }
    streams.delete(key);
    if (entry.chatId && latestByChat.get(entry.chatId) === key) {
      latestByChat.delete(entry.chatId);
    }
  }
}

/**
 * Idempotent upsert at POST time, before the stream is teed: an existing
 * entry keeps its buffer, state and subscribers; a provided `chatId` sets or
 * refreshes the "latest stream for this chat" index.
 */
export function register(key: string, options?: { chatId?: string }): void {
  evict();

  const existing = streams.get(key);
  if (existing) {
    if (options?.chatId) bindChatId(existing, key, options.chatId);
    return;
  }

  streams.set(key, {
    chunks: [],
    state: "streaming",
    complete: false,
    expiresAt: Date.now() + STREAM_TTL_MS,
    chatId: options?.chatId,
    subscribers: [],
  });
  if (options?.chatId) {
    latestByChat.set(options.chatId, key);
  }
}

/**
 * Bind a registered stream to a chatId after the fact (e.g. `onFinish`
 * learning the persisted DB chat id). No-op for unknown or expired keys.
 */
export function setChatId(key: string, chatId: string): void {
  evict();

  const entry = streams.get(key);
  if (!entry) return;

  bindChatId(entry, key, chatId);
}

/**
 * Record one SSE frame (already encoded, `data: {...}\n\n`) and notify the
 * tailing subscribers synchronously. Runs inside the SDK's fire-and-forget
 * `consumeSseStream` callback, so it NEVER throws: unknown or expired keys
 * are a silent no-op.
 */
export function append(key: string, sseChunk: string): void {
  evict();

  const entry = streams.get(key);
  if (!entry) return;

  entry.chunks.push(sseChunk);
  for (const subscriber of entry.subscribers) {
    try {
      subscriber.onChunk(sseChunk);
    } catch {
      // A throwing subscriber would surface as an unhandled rejection.
    }
  }
}

/**
 * The persistence transaction confirmed (`onFinish`): flip the state and
 * refresh the TTL from now. Never evicts or truncates — the buffer stays
 * replayable until the refreshed TTL. Idempotent.
 */
export function markPersisted(key: string): void {
  evict();

  const entry = streams.get(key);
  if (!entry) return;

  entry.state = "persisted";
  entry.expiresAt = Date.now() + STREAM_TTL_MS;
}

/**
 * The source closed (the consumer loop ended): the terminal
 * `data: [DONE]\n\n` is already in the buffer. Ends every subscriber exactly
 * once and forgets them; the buffer stays readable until TTL. Idempotent.
 */
export function completeStream(key: string): void {
  evict();

  const entry = streams.get(key);
  if (!entry) return;

  entry.complete = true;
  const subscribers = entry.subscribers;
  entry.subscribers = [];
  for (const subscriber of subscribers) {
    try {
      subscriber.onEnd();
    } catch {
      // Never let a subscriber break the producer loop.
    }
  }
}

/**
 * Resolve a GET resume path segment to a live stream key: the segment may be
 * the per-turn `streamKey` itself or a `chatId`, resolved through the
 * "latest stream per chat" index. A direct key hit always wins. `undefined`
 * when neither matches (never registered, or already expired).
 */
export function resolveStreamKey(keyOrChatId: string): string | undefined {
  if (get(keyOrChatId) !== undefined) return keyOrChatId;

  // `getLatestByChat` already owns the index lookup + liveness check (and
  // cleans a dangling index slot); only the key itself is missing from its
  // snapshot-oriented answer, so re-read the index for it.
  if (getLatestByChat(keyOrChatId) === undefined) return undefined;
  return latestByChat.get(keyOrChatId);
}

/** Snapshot of a live entry, or `undefined` when unknown/expired. */
export function get(key: string): StreamSnapshot | undefined {
  evict();

  const entry = streams.get(key);
  return entry ? snapshotOf(entry) : undefined;
}

/**
 * Most recently registered live stream for a chat (the resume seam for a
 * remount that no longer knows the per-turn `streamKey`).
 */
export function getLatestByChat(chatId: string): StreamSnapshot | undefined {
  evict();

  const key = latestByChat.get(chatId);
  if (!key) return undefined;

  const entry = streams.get(key);
  if (!entry) {
    latestByChat.delete(chatId);
    return undefined;
  }
  return snapshotOf(entry);
}

/**
 * Atomic replay+tail seam for the GET resume route: returns the current
 * snapshot (the past) AND registers the subscriber (the future) in the same
 * synchronous block, so no chunk can be lost between them. The subscriber
 * gets `onChunk` for every `append` after this point and `onEnd` on
 * `completeStream` or eviction. Returns `null` when there is no live entry;
 * when the stream is already complete it returns the snapshot WITHOUT
 * registering (there is no tail left to deliver).
 */
export function attach(
  key: string,
  subscriber: StreamSubscriber,
): StreamSnapshot | null {
  evict();

  const entry = streams.get(key);
  if (!entry) return null;

  const snapshot = snapshotOf(entry);
  if (!entry.complete) {
    entry.subscribers.push(subscriber);
  }
  return snapshot;
}
