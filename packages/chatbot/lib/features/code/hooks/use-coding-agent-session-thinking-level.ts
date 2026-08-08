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
  /** true mientras un cambio de modelo se persiste en el worker; al confirmarse (true→false) se refetches para ver el default del nuevo modelo. */
  isApplyingModel: boolean;
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
  isApplyingModel,
}: UseCodingAgentSessionThinkingLevelArgs): UseCodingAgentSessionThinkingLevelResult {
  const [level, setLevelState] = useState<ThinkingLevel | null>(null);
  const [levels, setLevels] = useState<ThinkingLevel[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(
    async (isCancelled: () => boolean) => {
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
        if (!isCancelled() && data.thinking) {
          setLevelState(data.thinking.level);
          setLevels(data.thinking.levels);
        }
      } catch {
        // Worker caído o red: mantener el estado anterior.
      } finally {
        if (!isCancelled()) setIsLoading(false);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    if (!enabled || !modelId) return;
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
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
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [isRunning, enabled, modelId, load]);

  // Refetch when a model change is confirmed: the worker applies the new
  // model's default thinking level as part of the model switch, so the
  // dropdown must re-read it once the POST resolves (isApplyingModel
  // true→false). Same pattern as isRunning.
  const prevIsApplyingRef = useRef(isApplyingModel);
  useEffect(() => {
    const modelChangeApplied =
      prevIsApplyingRef.current === true && isApplyingModel === false;
    prevIsApplyingRef.current = isApplyingModel;
    if (!modelChangeApplied || !enabled || !modelId) return;
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [isApplyingModel, enabled, modelId, load]);

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
