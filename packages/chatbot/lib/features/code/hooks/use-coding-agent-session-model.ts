"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseCodingAgentSessionModelArgs {
  sessionId: string;
  fallbackModelId: string;
}

export interface UseCodingAgentSessionModelResult {
  /** null while the session's model is being fetched from the worker. */
  modelId: string | null;
  setModelId: (modelId: string) => void;
  isLoading: boolean;
  /** true while an optimistic model change is being persisted to the worker. */
  isApplying: boolean;
}

/**
 * The Pi session in the worker is the authority on which model a session
 * uses; the picker must not assume a default while that answer is pending.
 * Until the fetch resolves, modelId is null and the picker renders a
 * skeleton. After that, the selection lives client-side and travels to the
 * worker with each message, as before.
 */
export function useCodingAgentSessionModel({
  sessionId,
  fallbackModelId,
}: UseCodingAgentSessionModelArgs): UseCodingAgentSessionModelResult {
  const [modelId, setModelIdState] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  // Monotonic sequence for optimistic applies: with the picker disabled while
  // isApplying is true, overlapping picks can no longer start from the UI, but
  // the hook still guards against a stale pick's catch/finally clobbering a
  // newer pick's state (revert race) or clearing isApplying early (dropping
  // the falling-edge refetch). Only the latest pick may revert or clear.
  const applySeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setModelIdState(null);

    const load = async () => {
      try {
        const response = await fetch(
          `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/model`,
        );
        if (!response.ok) {
          throw new Error(`Failed to load session model: ${response.status}`);
        }
        const data = (await response.json()) as { modelId: string | null };
        if (!cancelled) setModelIdState(data.modelId ?? fallbackModelId);
      } catch {
        if (!cancelled) setModelIdState(fallbackModelId);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionId, fallbackModelId]);

  const setModelId = useCallback(
    async (next: string) => {
      const previous = modelId;
      const seq = ++applySeqRef.current;
      setModelIdState(next);
      setIsApplying(true);
      try {
        const response = await fetch(
          `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/model`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modelId: next }),
          },
        );
        if (!response.ok) {
          throw new Error(`Failed to set model: ${response.status}`);
        }
      } catch {
        if (seq === applySeqRef.current) setModelIdState(previous);
      } finally {
        if (seq === applySeqRef.current) setIsApplying(false);
      }
    },
    [sessionId, modelId],
  );

  return { modelId, setModelId, isLoading: modelId === null, isApplying };
}
