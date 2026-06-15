"use client";

import { useMemo } from "react";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { getChatConfigurationByModelId } from "@/lib/features/foundation-model/config";
import type { ModelConfiguration } from "@/lib/features/foundation-model/types";

const unionSupportedFiles = (
  models: chatModelId[]
): Required<ModelConfiguration>["supportedFiles"] => {
  const set = new Set<Required<ModelConfiguration>["supportedFiles"][number]>();
  for (const model of models) {
    for (const f of getChatConfigurationByModelId(model).supportedFiles) set.add(f);
  }
  return Array.from(set);
};

const intersectSupportedFiles = (
  models: chatModelId[]
): Required<ModelConfiguration>["supportedFiles"] => {
  if (models.length === 0) return [];
  const [first, ...rest] = models;
  const base = new Set(getChatConfigurationByModelId(first).supportedFiles);
  for (const model of rest) {
    const current = new Set(getChatConfigurationByModelId(model).supportedFiles);
    for (const value of Array.from(base)) {
      if (!current.has(value)) base.delete(value);
    }
  }
  return Array.from(base);
};

export interface UseSupportedFilesArgs {
  /** Models currently selected in scope (if any). When present, we enforce intersection across them. */
  selectedModels: chatModelId[];
  /** Models currently available/eligible (used when there are no selectedModels yet). */
  availableModels: chatModelId[];
}

export const useSupportedFiles = ({
  selectedModels,
  availableModels,
}: UseSupportedFilesArgs): Required<ModelConfiguration>["supportedFiles"] => {
  return useMemo(() => {
    if (selectedModels.length > 0) {
      return intersectSupportedFiles(selectedModels);
    }
    return unionSupportedFiles(availableModels);
  }, [availableModels, selectedModels]);
};


