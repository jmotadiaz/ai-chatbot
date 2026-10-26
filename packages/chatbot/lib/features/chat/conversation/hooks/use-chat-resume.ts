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
   * The chat's live status VALUE, re-rendered on every stream transition. It
   * drives the intent-consumer effect: a visibility event that lands while a
   * request is still in flight records an intent, and this value settling
   * out of the in-flight states is what consumes it.
   */
  status: ChatStatus;
  /**
   * Reads the chat's live status at event time. Passed as a getter because
   * the event listeners are registered once, while `status` changes on every
   * stream transition.
   */
  getStatus: () => ChatStatus;
  /** The SDK's resume entry point (`useChat`'s `resumeStream`). */
  resumeStream: (options?: { body?: object }) => Promise<void>;
  /**
   * Reads the id of the client's LAST message at call time (a getter: the
   * probe reads it once, at probe time). The mount probe sends it as
   * `after` so the GET route can answer a silent `204` when the client
   * already holds the turn's exact message (a normal open of a completed
   * chat). The visibility/pageshow resumes deliberately pass NO `after`:
   * the client's last message may be a partial, and the full replay is
   * idempotent by the `start` chunk.
   */
  getLastMessageId?: () => string | undefined;
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
  /**
   * Serialises sends behind an in-flight resume (ticket 08). Resolves
   * immediately when no resume request is in flight; otherwise awaits the
   * resume promise itself — which always settles (silent `204`, replay
   * completion or fetch error), and when the probe attached to a live
   * stream it resolves when that stream ends: a send waits for the turn,
   * consistent with never sending over a live turn. `useChatSubmit`
   * (send) and `useChatReload` (regenerate) await it before `beginTurn()`
   * and the request — this replaces the protection the old
   * navigation-type gate provided.
   */
  resumeGate: () => Promise<void>;
}

/**
 * Client-side resume lifecycle for persisted chats (spec decision 5).
 *
 * The pending-turn signal is a ref set at send time and cleared on a clean
 * stream end — never a heuristic over message contents. When the user comes
 * back (`visibilitychange` to visible, or a bfcache `pageshow`), the hook
 * fires exactly one `resumeStream()`. No timers, no retries: the next event
 * is the retry.
 *
 * The race this guards against: on a frozen (hidden) page the OS/browser can
 * kill the in-flight fetch, and the JS rejection is only delivered AFTER the
 * page resumes — often after the `visibilitychange` listener has already run
 * against a still-`streaming` status. So a comeback event that lands while a
 * request is alive never aborts it: it records a resume INTENT (a ref), and
 * an effect watching the status value consumes the intent the moment the
 * status settles out of `streaming`/`submitted` while the page is visible.
 * The intent is consumed at most once, and it is dropped by a clean stream
 * end or by the page going hidden again (no resume while hidden).
 */
export const useChatResume = ({
  enabled,
  status,
  getStatus,
  resumeStream,
  getLastMessageId,
}: UseChatResumeArgs): UseChatResumeResult => {
  const streamKeyRef = useRef<string | undefined>(undefined);
  const pendingTurnRef = useRef(false);
  const resumingRef = useRef(false);
  /** The in-flight resume promise itself; `resumeGate` awaits it. */
  const resumePromiseRef = useRef<Promise<void> | undefined>(undefined);
  /** Resume intent recorded by a comeback event that hit an in-flight request. */
  const pendingIntentRef = useRef(false);

  // Kept current on every render for the once-registered event listeners.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const getStatusRef = useRef(getStatus);
  getStatusRef.current = getStatus;
  const resumeStreamRef = useRef(resumeStream);
  resumeStreamRef.current = resumeStream;
  const getLastMessageIdRef = useRef(getLastMessageId);
  getLastMessageIdRef.current = getLastMessageId;

  const beginTurn = useCallback((): string => {
    const key = v4();
    streamKeyRef.current = key;
    pendingTurnRef.current = true;
    return key;
  }, []);

  /**
   * Fires at most one `resumeStream()`; guards against live requests. The
   * optional `onSettle` runs once the resume attempt settles (success,
   * failure or silent `204`), while `resumingRef` is still held. The resume
   * promise is kept in `resumePromiseRef` until it settles, so the
   * `resumeGate` can serialise sends behind it.
   */
  const startResume = useCallback(
    ({ body, onSettle }: { body?: object; onSettle?: () => void } = {}): void => {
      // At most one resume in flight; further events are ignored until it
      // settles (the next event after a failure is the retry — no timers).
      if (resumingRef.current) return;
      resumingRef.current = true;
      const promise = resumeStreamRef
        .current(body !== undefined ? { body } : undefined)
        .catch(() => {
          // The SDK already surfaced the failure via `onError`; retrying is
          // the next visibility event's job.
        })
        .finally(() => {
          resumePromiseRef.current = undefined;
          resumingRef.current = false;
          onSettle?.();
        });
      resumePromiseRef.current = promise;
    },
    [],
  );

  /** Resolves when no resume request is in flight; else awaits it. */
  const resumeGate = useCallback((): Promise<void> => {
    return resumePromiseRef.current ?? Promise.resolve();
  }, []);

  const getStreamKey = useCallback(() => streamKeyRef.current, []);

  const noteStreamFinished = useCallback(
    ({ isAbort, isDisconnect, isError }: StreamFinishedArgs): void => {
      // `isAbort` means the user stopped the turn deliberately (the `stop`
      // path persists the partial server-side), so it is a clean end too.
      if (isAbort || (!isError && !isDisconnect)) {
        pendingTurnRef.current = false;
        streamKeyRef.current = undefined;
        // A clean end closes the turn: any recorded intent dies with it.
        pendingIntentRef.current = false;
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
    startResume();
  }, [startResume]);

  // Mount resume: exactly ONE probe per mount of a persisted chat, whatever
  // the navigation type (ticket 08). The old `reload`/`back_forward` gate
  // left a client-side `navigate` (sidebar click, app-root reopen) unprobed,
  // so an in-flight turn was invisible until a manual reload. The races the
  // gate guarded against are covered elsewhere now: `?after=` makes the
  // common open of a completed chat a silent `204`, and `resumeGate`
  // serialises sends behind an in-flight probe instead of racing it.
  useEffect(() => {
    if (!enabled) return;
    if (pendingTurnRef.current) return; // a turn is already in flight
    // Flag the pending turn BEFORE the probe: if the probe fails, the turn
    // stays pending and a later visibility event retries the resume.
    pendingTurnRef.current = true;
    // The probe carries the client's last message id as `after`: when the
    // entry's start message equals it (a normal open of a completed chat)
    // the route answers a silent `204` without replaying. When the client
    // holds nothing there is no `after` at all. The options' `body` reaches
    // `prepareReconnectToStreamRequest` (verified in `ai@6.0.287`), which
    // turns it into `?after=`.
    const after = getLastMessageIdRef.current?.();
    startResume({
      ...(after !== undefined && { body: { after } }),
      onSettle: () => {
        // The silent `204` path settles to `ready` with nothing to resume:
        // clear the flag so no phantom pending turn makes a later visibility
        // event fire a pointless resume. An `error` settle keeps it pending.
        if (getStatusRef.current() === "ready") {
          pendingTurnRef.current = false;
        }
      },
    });
  }, [enabled, startResume]);

  useEffect(() => {
    if (!enabled) return;

    const handleComeback = (): void => {
      if (!pendingTurnRef.current) return;
      const status = getStatusRef.current();
      if (status === "streaming" || status === "submitted") {
        // The event landed while a request was still alive: never abort it.
        // Record the intent instead — if the request turns out to have died
        // while the page was frozen (the rejection arrives only after the
        // page resumes), the status-settling effect consumes the intent.
        pendingIntentRef.current = true;
        return;
      }
      tryResume();
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState !== "visible") {
        // No resume while hidden: drop any recorded intent; the next
        // visibility event records a fresh one.
        pendingIntentRef.current = false;
        return;
      }
      handleComeback();
    };
    const handlePageShow = (event: Event): void => {
      // Browsers fire `pageshow` with `persisted: false` on every normal
      // load, where the mount effect above already probes; only a bfcache
      // restore (`persisted: true`) is a genuine "user came back".
      if (!(event as PageTransitionEvent).persisted) return;
      handleComeback();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [enabled, tryResume]);

  // Intent consumer: fires whenever the status settles out of the in-flight
  // states. It only acts on an intent recorded by a visibility/pageshow
  // event — a stream dying while the user is looking at the screen keeps
  // today's behavior (error + toast, no automatic resume).
  useEffect(() => {
    if (!enabled) return;
    if (!pendingIntentRef.current) return;
    if (status === "streaming" || status === "submitted") return;
    if (resumingRef.current) return; // wait for the in-flight resume to settle
    // The turn ended cleanly while the intent was pending: nothing to do.
    if (!pendingTurnRef.current) {
      pendingIntentRef.current = false;
      return;
    }
    // The page went hidden before the status settled: drop the intent; the
    // next visibility event records a fresh one.
    if (document.visibilityState !== "visible") {
      pendingIntentRef.current = false;
      return;
    }
    // Consumed at most once: a failed resume cannot re-trigger itself from
    // its own status transition (the intent is already gone).
    pendingIntentRef.current = false;
    tryResume();
  }, [enabled, status, tryResume]);

  return { beginTurn, getStreamKey, noteStreamFinished, resumeGate };
};
