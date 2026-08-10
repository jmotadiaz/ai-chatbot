"use client";

import { useEffect, useRef, useState } from "react";
import type { CodingAgentSkill } from "@/components/code/skills-control";

/**
 * `initialSkills` is what the server render resolved: an array (possibly
 * empty) means it asked and got an answer, so no fetch is needed; null means
 * it could not ask and the fetch runs as before.
 */
export function useCodingAgentSkills(
  sessionId: string,
  enabled: boolean,
  initialSkills?: CodingAgentSkill[] | null,
) {
  const [skills, setSkills] = useState<CodingAgentSkill[]>(
    initialSkills ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seededSessionRef = useRef(initialSkills ? sessionId : null);

  useEffect(() => {
    if (!enabled) return;
    if (seededSessionRef.current === sessionId) return;
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
