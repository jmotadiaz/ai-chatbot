"use client";

import { useMemo } from "react";
import type { ChatBody, ChatConfig } from "./hook-types";
import type { Agent } from "@/lib/features/chat/types";

export interface UseChatRequestBodyArgs {
  chatId?: string;
  validQueryParamChatId?: string;
  projectId?: string;
  preventChatPersistence: boolean;
  agent: Agent;
  systemPrompt?: string;
  chatConfig: ChatConfig;
}

export const useChatRequestBody = ({
  chatId,
  validQueryParamChatId,
  projectId,
  preventChatPersistence,
  agent,
  systemPrompt,
  chatConfig,
}: UseChatRequestBodyArgs): ChatBody => {
  return useMemo(() => {
    return {
      chatId: chatId || validQueryParamChatId,
      projectId,
      preventChatPersistence,
      agent,
      systemPrompt,
      ...chatConfig,
    };
  }, [
    chatId,
    validQueryParamChatId,
    projectId,
    preventChatPersistence,
    agent,
    systemPrompt,
    chatConfig,
  ]);
};
