"use client";

import { useEffect } from "react";
import type { UseChatHubInstanceArgs } from "../types";
import type { Tools, ChatbotMessage } from "@/lib/features/chat/types";
import {
  defaultRagMaxResources,
  defaultWebSearchNumResults,
} from "@/lib/features/foundation-model/constants";
import { useChatConfig } from "@/lib/features/chat/hooks/use-chat-config";
import { useChatRequestBody } from "@/lib/features/chat/hooks/use-chat-request-body";
import { useChatSession } from "@/lib/features/chat/hooks/use-chat-session";

export interface UseChatHubInstanceConfig
  extends UseChatHubInstanceArgs {
  initialMessages?: ChatbotMessage[];
  projectId?: string;
  chatId?: string;
  temperature?: number;
  systemPrompt?: string;
  tools?: Tools;
  preventChatPersistence?: boolean;
  ragMaxResources?: number;
  webSearchNumResults?: number;
}

export const useChatHubInstance = ({
  id,
  model,
  submitSubscribe,
  initialMessages,
  projectId,
  chatId,
  temperature,
  systemPrompt,
  tools = [],
  preventChatPersistence = false,
  ragMaxResources = defaultRagMaxResources,
  webSearchNumResults = defaultWebSearchNumResults,
}: UseChatHubInstanceConfig) => {
  // Instance owns its own session + UI state.
  const chatResult = useChatSession({
    initialMessages,
    api: "/api/chat",
    throttleMs: 200,
  });

  const { chatConfig } = useChatConfig({
    selectedModel: model,
    temperature,
    ragMaxResources,
    webSearchNumResults,
  });

  const body = useChatRequestBody({
    chatId,
    validQueryParamChatId: undefined,
    projectId,
    preventChatPersistence,
    tools,
    systemPrompt,
    chatConfig,
  });

  useEffect(() => {
    // Register fire-and-forget handler. Hub controls message payload; instance controls body/session.
    return submitSubscribe(async (message) => {
      await chatResult.sendMessage(message, { body });
    });
  }, [body, chatResult, submitSubscribe]);

  return {
    instanceId: id,
    model,
    ...chatResult,
  };
};


