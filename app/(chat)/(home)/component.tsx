import React from "react";
import {
  defaultModel,
  defaultWebSearchNumResults,
  defaultRagSimilarityPercentage,
  defaultRagMaxResources,
} from "@/lib/features/foundation-model/config";

import { ChatLayout } from "@/app/(chat)/chat-layout";

export const ChatHomeComponent: React.FC = () => {
  return (
    <ChatLayout
      chatConfig={{
        selectedModel: defaultModel,
        refinePromptMode: "chat",
        webSearchNumResults: defaultWebSearchNumResults,
        ragSimilarityPercentage: defaultRagSimilarityPercentage,
        ragMaxResources: defaultRagMaxResources,
        tools: [],
      }}
    />
  );
};
