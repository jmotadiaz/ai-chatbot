"use client";

import { useEffect } from "react";
import { DataUIPart } from "ai";
import type { UseChatHubInstanceArgs } from "../types";
import type { Tools, ChatbotMessage, ChatbotDataPart } from "@/lib/features/chat/types";
import {
  defaultRagMaxResources,
  defaultWebSearchNumResults,
} from "@/lib/features/foundation-model/constants";
import { useChatConfig } from "@/lib/features/chat/hooks/use-chat-config";
import { useChatRequestBody } from "@/lib/features/chat/hooks/use-chat-request-body";
import { useChatSession, UseChatSessionResult } from "@/lib/features/chat/hooks/use-chat-session";
import { useChatDataPartState } from "@/lib/features/chat/hooks/use-chat-data-part-state";
import { chatModelId } from "@/lib/features/foundation-model/config";

export interface UseChatHubInstanceConfig
  extends UseChatHubInstanceArgs {
  initialMessages?: ChatbotMessage[];
  projectId?: string;
  temperature?: number;
  systemPrompt?: string;
  tools?: Tools;
  preventChatPersistence?: boolean;
  ragMaxResources?: number;
  webSearchNumResults?: number;
}

export interface UseChatHubInstanceResult extends UseChatSessionResult {
  chatId: string;
  model: chatModelId;
  dataPart: DataUIPart<ChatbotDataPart> | undefined;
}

export const useChatHubInstance = ({
  chatId,
  model,
  submitSubscribe,
  initialMessages,
  projectId,
  temperature,
  systemPrompt,
  tools = [],
  preventChatPersistence = false,
  ragMaxResources = defaultRagMaxResources,
  webSearchNumResults = defaultWebSearchNumResults,
}: UseChatHubInstanceConfig): UseChatHubInstanceResult => {
  const { dataPart, setDataPart } = useChatDataPartState();
  // Instance owns its own session + UI state.
  const chatResult = useChatSession({
    initialMessages,
    api: "/api/chat",
    onDataPart: setDataPart,
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
    ...chatResult,
    chatId,
    model,
    dataPart,
  };
};


