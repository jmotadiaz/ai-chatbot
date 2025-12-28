"use client";

import { useCallback, useState } from "react";
import type { ChatConfig, SetChatConfig } from "./hook-types";
import {
  defaultModel,
  defaultRagMaxResources,
  defaultWebSearchNumResults,
} from "@/lib/features/foundation-model/constants";
import { getChatConfigurationByModelId } from "@/lib/features/foundation-model/helpers";

export const useChatConfig = ({
  selectedModel = defaultModel,
  temperature,
  ragMaxResources,
  webSearchNumResults,
}: Partial<ChatConfig>): {
  chatConfig: ChatConfig;
  setConfig: SetChatConfig;
} => {
  const [chatConfig, setChatConfig] = useState<ChatConfig>(() =>
    Object.assign(
      getChatConfigurationByModelId(selectedModel),
      Object.fromEntries(
        Object.entries({
          temperature,
          ragMaxResources,
          webSearchNumResults,
        }).filter(([, value]) => value !== undefined && value !== null)
      ),
      {
        selectedModel,
        useRAG: false,
        useWebSearch: false,
        ragMaxResources:
          ragMaxResources !== undefined
            ? ragMaxResources
            : defaultRagMaxResources,
        webSearchNumResults:
          webSearchNumResults !== undefined
            ? webSearchNumResults
            : defaultWebSearchNumResults,
      }
    )
  );

  const setConfig = useCallback<SetChatConfig>((config) => {
    setChatConfig((prev) => ({
      ...prev,
      ...config,
    }));
  }, []);

  return { chatConfig, setConfig };
};


