import React from "react";
import {
  defaultModel,
  defaultWebSearchNumResults,
} from "@/lib/features/foundation-model/config";

import { ChatLayout } from "@/app/(chat)/chat-layout";
import { RAG_TOOL } from "@/lib/features/rag/constants";

export const ChatHomeComponent: React.FC = () => {
  return (
    <ChatLayout
      chatConfig={{
        selectedModel: defaultModel,
        refinePromptMode: "chat",
        webSearchNumResults: defaultWebSearchNumResults,
        tools: [RAG_TOOL],
      }}
    />
  );
};
