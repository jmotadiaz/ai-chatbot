"use client";

import { useMemo } from "react";
import type { ChatBody, ChatConfig } from "./hook-types";
import type { ChatMode } from "@/lib/features/chat/types";

export interface UseChatRequestBodyArgs {
  chatId?: string;
  validQueryParamChatId?: string;
  projectId?: string;
  preventChatPersistence: boolean;
  chatMode: ChatMode;
  systemPrompt?: string;
  chatConfig: ChatConfig;
}

export const useChatRequestBody = ({
  chatId,
  validQueryParamChatId,
  projectId,
  preventChatPersistence,
  chatMode,
  systemPrompt,
  chatConfig,
}: UseChatRequestBodyArgs): ChatBody => {
  return useMemo(() => {
    return {
      chatId: chatId || validQueryParamChatId,
      projectId,
      preventChatPersistence,
      chatMode,
      systemPrompt,
      ...chatConfig,
    };
  }, [
    chatId,
    validQueryParamChatId,
    projectId,
    preventChatPersistence,
    chatMode,
    systemPrompt,
    chatConfig,
  ]);
};
