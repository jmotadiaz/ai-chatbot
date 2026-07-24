"use client";

import { useEffect, useState } from "react";
import type { CodingAgentSkill } from "@/components/code/skills-control";

export function useCodingAgentSkills(sessionId: string, enabled: boolean) {
  const [skills, setSkills] = useState<CodingAgentSkill[]>([]);
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
          `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/skills`,
        );
        if (!response.ok) {
          throw new Error(`Failed to load skills: ${response.status}`);
        }
        const data = (await response.json()) as { skills?: CodingAgentSkill[] };
        if (!cancelled) setSkills(data.skills ?? []);
      } catch {
        if (!cancelled) setError("Skills could not be loaded.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionId, enabled]);

  return { skills, isLoading, error };
}
