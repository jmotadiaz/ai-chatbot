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
  chatId?: string;
  temperature?: number;
  systemPrompt?: string;
  tools?: Tools;
  preventChatPersistence?: boolean;
  ragMaxResources?: number;
  webSearchNumResults?: number;
}

export interface UseChatHubInstanceResult extends UseChatSessionResult {
  instanceId: string;
  model: chatModelId;
  dataPart: DataUIPart<ChatbotDataPart> | undefined;
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
    instanceId: id,
    model,
    dataPart,
  };
};


