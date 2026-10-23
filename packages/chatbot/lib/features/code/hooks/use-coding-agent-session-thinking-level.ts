"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ThinkingLevel } from "@/lib/features/foundation-model/config";

export interface UseCodingAgentSessionThinkingLevelArgs {
  sessionId: string;
  /** Model selected in the picker; null while it is being resolved. */
  modelId: string | null;
  /** Catalog default for the selected model (served by the page). */
  defaultLevel: ThinkingLevel | undefined;
  /**
   * What the server render found out about the session's level.
   * `null` = it could not be asked, so the GET is still needed.
   * `{ level: null }` = it was asked and the session has never run, which is
   * exactly the case where the catalog default has to be kept.
   */
  initialThinking?: { level: ThinkingLevel | null } | null;
}

export interface UseCodingAgentSessionThinkingLevelResult {
  /** Level that will apply on the next turn; null until there is a model. */
  level: ThinkingLevel | null;
  setLevel: (level: ThinkingLevel) => void;
}

/**
 * The reasoning level is lazy, just like the model: it only matters when a
 * turn runs, so it lives on the client and travels with the prompt. This is
 * what makes it adjustable in a new session, before the first message, while
 * the worker has no session to consult yet.
 *
 * Where the displayed value comes from, in order:
 *  1. The session's real level if the server already resolved it (immediate).
 *  2. The catalog default for the selected model (immediate).
 *  3. The session's real level, if it already exists in the worker (GET, once).
 *  4. Whatever the user picks.
 */
export function useCodingAgentSessionThinkingLevel({
  sessionId,
  modelId,
  defaultLevel,
  initialThinking,
}: UseCodingAgentSessionThinkingLevelArgs): UseCodingAgentSessionThinkingLevelResult {
  const [level, setLevelState] = useState<ThinkingLevel | null>(
    initialThinking?.level ?? null,
  );

  // A level already resolved by the server must not be lost when the model is
  // resolved for the first time: that first pass through the effect below
  // would overwrite it with the catalog default. It is consumed only once, so a
  // later model change does reset to the default, as always.
  const pendingSeedRef = useRef(initialThinking?.level != null);

  // Anything that sets the level after the initial GET starts (choosing a
  // model, choosing a level) invalidates its answer: the GET describes the
  // session as it was, and by then that is no longer what the user sees.
  const seedTokenRef = useRef(0);
  const previousModelIdRef = useRef<string | null>(null);
  // A server answer (even "this session has never run") makes the GET
  // unnecessary for this session.
  const fetchedSessionRef = useRef<string | null>(
    initialThinking ? sessionId : null,
  );

  useEffect(() => {
    if (!modelId) return;
    const previousModelId = previousModelIdRef.current;
    previousModelIdRef.current = modelId;
    if (previousModelId === modelId) return;
    if (previousModelId === null && pendingSeedRef.current) {
      pendingSeedRef.current = false;
      return;
    }
    // Model change: the session's level belongs to the previous model, so it is
    // discarded and the new model's default is shown (which is exactly what the
    // worker will apply when sending).
    if (previousModelId !== null) seedTokenRef.current += 1;
    setLevelState(defaultLevel ?? null);
  }, [modelId, defaultLevel]);

  useEffect(() => {
    if (!modelId) return;
    if (fetchedSessionRef.current === sessionId) return;
    fetchedSessionRef.current = sessionId;

    const token = seedTokenRef.current;
    void (async () => {
      try {
        const response = await fetch(
          `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/thinking-level`,
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          thinking: { level: ThinkingLevel } | null;
        };
        // Session with no material in the worker (no messages yet): the catalog
        // default is kept.
        if (data.thinking && token === seedTokenRef.current) {
          setLevelState(data.thinking.level);
        }
      } catch {
        // Worker down or network failure: the catalog default is kept.
      }
    })();
  }, [sessionId, modelId]);

  const setLevel = useCallback((next: ThinkingLevel) => {
    seedTokenRef.current += 1;
    setLevelState(next);
  }, []);

  return { level, setLevel };
}
