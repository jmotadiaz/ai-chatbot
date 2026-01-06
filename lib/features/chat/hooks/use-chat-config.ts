"use client";

import { useCallback, useState } from "react";
import type { ChatConfig, SetChatConfig } from "./hook-types";
import {
  defaultModel,
  defaultRagMaxResources,
  defaultWebSearchNumResults,
  getChatConfigurationByModelId,
} from "@/lib/features/foundation-model/config";

export const useChatConfig = ({
  selectedModel = defaultModel,
  temperature,
  topP,
  topK,
  ragMaxResources,
  webSearchNumResults,
}: Partial<ChatConfig>): {
  chatConfig: ChatConfig;
  setConfig: SetChatConfig;
} => {
  const [chatConfig, setChatConfig] = useState<ChatConfig>(() => {
    const modelConfig = getChatConfigurationByModelId(selectedModel);
    return {
      selectedModel,
      temperature: temperature ?? modelConfig.temperature,
      topP: topP ?? modelConfig.topP,
      topK: topK ?? modelConfig.topK,
      ragMaxResources: ragMaxResources ?? defaultRagMaxResources,
      webSearchNumResults: webSearchNumResults ?? defaultWebSearchNumResults,
    };
  });

  const setConfig = useCallback<SetChatConfig>((config) => {
    setChatConfig((prev) => ({
      ...prev,
      ...config,
    }));
  }, []);

  return { chatConfig, setConfig };
};


