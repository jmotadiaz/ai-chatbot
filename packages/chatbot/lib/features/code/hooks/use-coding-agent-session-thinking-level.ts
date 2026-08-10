"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ThinkingLevel } from "models";

export interface UseCodingAgentSessionThinkingLevelArgs {
  sessionId: string;
  /** Modelo seleccionado en el picker; null mientras se resuelve. */
  modelId: string | null;
  /** Default del catálogo para el modelo seleccionado (lo sirve la página). */
  defaultLevel: ThinkingLevel | undefined;
  /**
   * Lo que el render de servidor averiguó sobre el nivel de la sesión.
   * `null` = no se pudo preguntar, así que el GET sigue haciendo falta.
   * `{ level: null }` = sí se preguntó y la sesión nunca ha corrido, que es
   * justo el caso en el que hay que quedarse con el default del catálogo.
   */
  initialThinking?: { level: ThinkingLevel | null } | null;
}

export interface UseCodingAgentSessionThinkingLevelResult {
  /** Nivel que se aplicará en el próximo turno; null hasta que hay modelo. */
  level: ThinkingLevel | null;
  setLevel: (level: ThinkingLevel) => void;
}

/**
 * El nivel de razonamiento es perezoso, igual que el modelo: solo importa
 * cuando corre un turno, así que vive en el cliente y viaja con el prompt.
 * Esto es lo que permite ajustarlo en una sesión nueva, antes del primer
 * mensaje, cuando el worker todavía no tiene sesión que consultar.
 *
 * De dónde sale el valor que se muestra, por orden:
 *  1. El nivel real de la sesión si el servidor ya lo resolvió (inmediato).
 *  2. El default del catálogo para el modelo seleccionado (inmediato).
 *  3. El nivel real de la sesión, si ya existe en el worker (GET, una vez).
 *  4. Lo que elija el usuario.
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

  // Un nivel que ya viene resuelto del servidor no debe perderse cuando el
  // modelo se resuelve por primera vez: ese primer paso por el efecto de
  // abajo escribiría el default del catálogo encima. Se consume una sola vez,
  // así que un cambio de modelo posterior sí resetea al default, como siempre.
  const pendingSeedRef = useRef(initialThinking?.level != null);

  // Cualquier cosa que fije el nivel después de que arranque el GET inicial
  // (elegir modelo, elegir nivel) invalida su respuesta: el GET describe la
  // sesión tal como estaba, y para entonces ya no es lo que el usuario ve.
  const seedTokenRef = useRef(0);
  const previousModelIdRef = useRef<string | null>(null);
  // Una respuesta del servidor (aunque sea "esta sesión nunca ha corrido")
  // hace innecesario el GET para esta sesión.
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
    // Cambio de modelo: el nivel de la sesión es del modelo anterior, así que
    // se descarta y se muestra el default del nuevo (que es justo lo que el
    // worker aplicará al enviar).
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
        // Sesión sin material en el worker (aún sin mensajes): se queda el
        // default del catálogo.
        if (data.thinking && token === seedTokenRef.current) {
          setLevelState(data.thinking.level);
        }
      } catch {
        // Worker caído o red: se queda el default del catálogo.
      }
    })();
  }, [sessionId, modelId]);

  const setLevel = useCallback((next: ThinkingLevel) => {
    seedTokenRef.current += 1;
    setLevelState(next);
  }, []);

  return { level, setLevel };
}
