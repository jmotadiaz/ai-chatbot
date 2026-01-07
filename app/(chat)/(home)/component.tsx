import React from "react";
import {
  defaultModel,
  defaultWebSearchNumResults,
  defaultRagSimilarityPercentage,
  defaultRagMaxResources,
} from "@/lib/features/foundation-model/config";
import { defaultMetaPrompt } from "@/lib/features/meta-prompt/prompts";

import { ChatLayout } from "@/app/(chat)/chat-layout";

export const ChatHomeComponent: React.FC = () => {
  return (
    <ChatLayout
      chatConfig={{
        selectedModel: defaultModel,
        metaPrompt: defaultMetaPrompt,
        webSearchNumResults: defaultWebSearchNumResults,
        ragSimilarityPercentage: defaultRagSimilarityPercentage,
        ragMaxResources: defaultRagMaxResources,
        tools: [],
      }}
    />
  );
};
