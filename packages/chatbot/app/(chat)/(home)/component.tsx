import React from "react";
import {
  defaultModel,
  defaultWebSearchNumResults,
} from "@/lib/features/foundation-model/config";
import { fetchModelCatalog } from "@/lib/infrastructure/ai/catalog";

import { ChatLayout } from "@/app/(chat)/chat-layout";

export const ChatHomeComponent: React.FC = async () => {
  const catalog = await fetchModelCatalog();

  return (
    <ChatLayout
      chatConfig={{
        selectedModel: defaultModel(catalog),
        refinePromptMode: "chat",
        webSearchNumResults: defaultWebSearchNumResults,
      }}
    />
  );
};
