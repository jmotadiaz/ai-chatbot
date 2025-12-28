"use client";

import { useMemo } from "react";
import type { ChatBody, ChatConfig } from "./hook-types";
import type { Tools } from "@/lib/features/chat/types";

export interface UseChatRequestBodyArgs {
  chatId?: string;
  validQueryParamChatId?: string;
  projectId?: string;
  preventChatPersistence: boolean;
  tools: Tools;
  systemPrompt?: string;
  chatConfig: ChatConfig;
}

export const useChatRequestBody = ({
  chatId,
  validQueryParamChatId,
  projectId,
  preventChatPersistence,
  tools,
  systemPrompt,
  chatConfig,
}: UseChatRequestBodyArgs): ChatBody => {
  return useMemo(() => {
    return {
      chatId: chatId || validQueryParamChatId,
      projectId,
      preventChatPersistence,
      tools,
      systemPrompt,
      ...chatConfig,
    };
  }, [
    chatId,
    validQueryParamChatId,
    projectId,
    preventChatPersistence,
    tools,
    systemPrompt,
    chatConfig,
  ]);
};


