"use client";

import { useEffect, useRef, useState } from "react";

export interface UseCodingAgentSessionModelArgs {
  sessionId: string;
  fallbackModelId: string;
  /**
   * Model resolved during the server render. When set the hook starts with it
   * and skips its fetch — same answer, one round trip earlier. Null means the
   * server had none (or could not ask), so the fetch happens as before.
   */
  initialModelId?: string | null;
}

export interface UseCodingAgentSessionModelResult {
  /** null while the session's model is being fetched from the worker. */
  modelId: string | null;
  setModelId: (modelId: string) => void;
  isLoading: boolean;
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
  initialModelId,
}: UseCodingAgentSessionModelArgs): UseCodingAgentSessionModelResult {
  const [modelId, setModelId] = useState<string | null>(initialModelId ?? null);

  // Which session the seed answered for. Navigating to another session leaves
  // the seed behind and the fetch takes over again.
  const seededSessionRef = useRef(initialModelId ? sessionId : null);

  useEffect(() => {
    if (seededSessionRef.current === sessionId) return;
    let cancelled = false;
    setModelId(null);

    const load = async () => {
      try {
        const response = await fetch(
          `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/model`,
        );
        if (!response.ok) {
          throw new Error(`Failed to load session model: ${response.status}`);
        }
        const data = (await response.json()) as { modelId: string | null };
        if (!cancelled) setModelId(data.modelId ?? fallbackModelId);
      } catch {
        if (!cancelled) setModelId(fallbackModelId);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionId, fallbackModelId]);

  return { modelId, setModelId, isLoading: modelId === null };
}
