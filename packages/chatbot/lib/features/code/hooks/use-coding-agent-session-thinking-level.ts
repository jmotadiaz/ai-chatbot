"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ThinkingLevel } from "models";

export interface UseCodingAgentSessionThinkingLevelArgs {
  sessionId: string;
  /** Modelo activo; el nivel se refetches cuando cambia (el worker aplicó el default del nuevo modelo). */
  modelId: string | null;
  enabled: boolean;
  /** true mientras un turno corre; al terminar (true→false) se refetches, porque el worker aplicó el default en el arranque/cambio de modelo. */
  isRunning: boolean;
}

export interface UseCodingAgentSessionThinkingLevelResult {
  /** null mientras carga o si no hay datos aún. */
  level: ThinkingLevel | null;
  /** Niveles disponibles del modelo actual; ["off"] si el modelo no razona. */
  levels: ThinkingLevel[];
  isLoading: boolean;
  setLevel: (level: ThinkingLevel) => Promise<void>;
}

export function useCodingAgentSessionThinkingLevel({
  sessionId,
  modelId,
  enabled,
  isRunning,
}: UseCodingAgentSessionThinkingLevelArgs): UseCodingAgentSessionThinkingLevelResult {
  const [level, setLevelState] = useState<ThinkingLevel | null>(null);
  const [levels, setLevels] = useState<ThinkingLevel[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Monotonic sequence token: the two refetch paths (modelId change + the
  // isRunning falling edge) can overlap, and a slow GET that started with
  // old-model data must never overwrite fresher state. Each load captures
  // the token at start and only applies state if it is still the latest.
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/thinking-level`,
      );
      if (!response.ok) {
        throw new Error(`Failed to load thinking level: ${response.status}`);
      }
      const data = (await response.json()) as {
        thinking: { level: ThinkingLevel; levels: ThinkingLevel[] } | null;
      };
      if (seq === loadSeqRef.current && data.thinking) {
        setLevelState(data.thinking.level);
        setLevels(data.thinking.levels);
      }
    } catch {
      // Worker caído o red: mantener el estado anterior.
    } finally {
      if (seq === loadSeqRef.current) setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!enabled || !modelId) return;
    void load();
  }, [sessionId, modelId, enabled, load]);

  // Refetch when a run finishes: on session create / model switch the worker
  // only applies the default thinking level once a message is sent, so the
  // control would otherwise stay hidden (or show the old model's levels)
  // until the component remounts.
  const prevIsRunningRef = useRef(isRunning);
  useEffect(() => {
    const runFinished = prevIsRunningRef.current === true && isRunning === false;
    prevIsRunningRef.current = isRunning;
    if (!runFinished || !enabled || !modelId) return;
    void load();
  }, [isRunning, enabled, modelId, load]);

  const setLevel = async (next: ThinkingLevel) => {
    const response = await fetch(
      `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/thinking-level`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: next }),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to set thinking level: ${response.status}`);
    }
    const data = (await response.json()) as {
      thinking: { level: ThinkingLevel } | null;
    };
    if (data.thinking) setLevelState(data.thinking.level);
  };

  return { level, levels, isLoading, setLevel };
}
