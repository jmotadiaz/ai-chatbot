"use client";

import { useMemo } from "react";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { getChatConfigurationByModelId } from "@/lib/features/foundation-model/helpers";

/**
 * True if tools can be enabled for the given set of models.
 * - When there are no models (e.g. hub before instances), tools are allowed.
 * - Otherwise, all models must support tool-calling.
 */
export const useToolsEnabled = (models: chatModelId[]): boolean => {
  return useMemo(() => {
    if (models.length === 0) return true;
    return models.every((m) => getChatConfigurationByModelId(m).toolCalling);
  }, [models]);
};


