"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ChatStatus } from "ai";
import { v4 } from "uuid";

export interface UseChatResumeArgs {
  /**
   * Resume is enabled only for persisted chats (spec decision 6): the hub,
   * temporary chats and the project form keep today's behavior.
   */
  enabled: boolean;
  /**
   * Reads the chat's live status at event time. Passed as a getter because
   * the event listeners are registered once, while `status` changes on every
   * stream transition.
   */
  getStatus: () => ChatStatus;
  /** The SDK's resume entry point (`useChat`'s `resumeStream`). */
  resumeStream: () => Promise<void>;
}

export interface StreamFinishedArgs {
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
}

export interface UseChatResumeResult {
  /**
   * Marks the beginning of a turn: generates the per-turn `streamKey` (one
   * per send, never per chat), stores it as the current key and flags a turn
   * as pending. Call right before `send`/`regenerate` so the POST body can
   * carry the key.
   */
  beginTurn: () => string;
  /**
   * The ref reader handed to the session transport: reads the CURRENT
   * turn's key at request time (the transport is constructed once, so it
   * must not capture a stale value).
   */
  getStreamKey: () => string | undefined;
  /**
   * The client-side `onFinish` witness: clears the pending turn only when
   * the stream ended cleanly — including a deliberate user stop
   * (`isAbort`). On error or disconnect the turn stays pending so a later
   * visibility event can resume it (the server keeps generating).
   */
  noteStreamFinished: (args: StreamFinishedArgs) => void;
}

/**
 * Client-side resume lifecycle for persisted chats (spec decision 5).
 *
 * The pending-turn signal is a ref set at send time and cleared on a clean
 * stream end — never a heuristic over message contents. When the user comes
 * back (`visibilitychange` to visible, or a bfcache `pageshow`), and the
 * turn is still pending while no request is live, the hook fires exactly
 * one `resumeStream()`. No timers, no retries: the next event is the retry.
 */
export const useChatResume = ({
  enabled,
  getStatus,
  resumeStream,
}: UseChatResumeArgs): UseChatResumeResult => {
  const streamKeyRef = useRef<string | undefined>(undefined);
  const pendingTurnRef = useRef(false);
  const resumingRef = useRef(false);

  // Kept current on every render for the once-registered event listeners.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const getStatusRef = useRef(getStatus);
  getStatusRef.current = getStatus;
  const resumeStreamRef = useRef(resumeStream);
  resumeStreamRef.current = resumeStream;

  const beginTurn = useCallback((): string => {
    const key = v4();
    streamKeyRef.current = key;
    pendingTurnRef.current = true;
    return key;
  }, []);

  const getStreamKey = useCallback(() => streamKeyRef.current, []);

  const noteStreamFinished = useCallback(
    ({ isAbort, isDisconnect, isError }: StreamFinishedArgs): void => {
      // `isAbort` means the user stopped the turn deliberately (the `stop`
      // path persists the partial server-side), so it is a clean end too.
      if (isAbort || (!isError && !isDisconnect)) {
        pendingTurnRef.current = false;
        streamKeyRef.current = undefined;
      }
    },
    [],
  );

  const tryResume = useCallback((): void => {
    if (!enabledRef.current) return;
    if (!pendingTurnRef.current) return;
    // Never resume over an in-flight POST/resume: aborting a live request
    // would kill the very stream we are trying to keep.
    const status = getStatusRef.current();
    if (status === "streaming" || status === "submitted") return;
    // At most one resume in flight; further events are ignored until it
    // settles (the next event after a failure is the retry — no timers).
    if (resumingRef.current) return;

    resumingRef.current = true;
    void resumeStreamRef.current()
      .catch(() => {
        // The SDK already surfaced the failure via `onError`; retrying is
        // the next visibility event's job.
      })
      .finally(() => {
        resumingRef.current = false;
      });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = (): void => {
      if (document.visibilityState !== "visible") return;
      tryResume();
    };
    const handlePageShow = (event: Event): void => {
      // Browsers fire `pageshow` with `persisted: false` on every normal
      // load, where `resume: true` already resumes on mount; only a bfcache
      // restore (`persisted: true`) is a genuine "user came back".
      if (!(event as PageTransitionEvent).persisted) return;
      tryResume();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [enabled, tryResume]);

  return { beginTurn, getStreamKey, noteStreamFinished };
};
