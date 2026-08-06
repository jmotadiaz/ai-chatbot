"use client";

import { useEffect, useState } from "react";
import type {
  PromptSummary,
  SessionSummary,
} from "@/lib/features/code/worker-client";

export function useCodingAgentPrompts(sessionId: string, enabled: boolean) {
  const [prompts, setPrompts] = useState<PromptSummary[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
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
