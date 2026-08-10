"use client";

import { useEffect, useRef, useState } from "react";
import type {
  PromptSummary,
  SessionSummary,
} from "@/lib/features/code/worker-client";

export interface UseCodingAgentPromptsSeed {
  prompts: PromptSummary[];
  sessions: SessionSummary[];
}

/**
 * `initialData` is what the server render resolved: present means it asked and
 * got an answer (the lists may legitimately be empty), so no fetch is needed;
 * null means it could not ask and the fetch runs as before.
 */
export function useCodingAgentPrompts(
  sessionId: string,
  enabled: boolean,
  initialData?: UseCodingAgentPromptsSeed | null,
) {
  const [prompts, setPrompts] = useState<PromptSummary[]>(
    initialData?.prompts ?? [],
  );
  const [sessions, setSessions] = useState<SessionSummary[]>(
    initialData?.sessions ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seededSessionRef = useRef(initialData ? sessionId : null);

  useEffect(() => {
    if (!enabled) return;
    if (seededSessionRef.current === sessionId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const load = async () => {
      try {
        const response = await fetch(
          `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/prompts`,
        );
        if (!response.ok) {
          throw new Error(`Failed to load prompts: ${response.status}`);
        }
        const data = (await response.json()) as {
          prompts?: PromptSummary[];
          sessions?: SessionSummary[];
        };
        if (!cancelled) {
          setPrompts(data.prompts ?? []);
          setSessions(data.sessions ?? []);
        }
      } catch {
        if (!cancelled) setError("Prompts could not be loaded.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionId, enabled]);

  return { prompts, sessions, isLoading, error };
}
