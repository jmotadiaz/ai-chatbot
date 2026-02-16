"use client";

import { useEffect, useMemo } from "react";
import { DataUIPart } from "ai";
import type { UseChatHubInstanceArgs } from "../types";
import type {
  Tools,
  ChatbotMessage,
  ChatbotDataPart,
  Agent,
} from "@/lib/features/chat/types";
import {
  defaultWebSearchNumResults,
  chatModelId,
  getChatConfigurationByModelId,
  defaultRagMaxResources,
  defaultMinRagScore,
} from "@/lib/features/foundation-model/config";
import { useChatRequestBody } from "@/lib/features/chat/hooks/use-chat-request-body";
import {
  useChatSession,
  UseChatSessionResult,
} from "@/lib/features/chat/hooks/use-chat-session";
import { useChatDataPartState } from "@/lib/features/chat/hooks/use-chat-data-part-state";
import type {
  ChatConfig,
  SetChatConfig,
} from "@/lib/features/chat/hooks/hook-types";

export interface UseChatHubInstanceConfig extends UseChatHubInstanceArgs {
  initialMessages?: ChatbotMessage[];
  projectId?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  systemPrompt?: string;
  tools?: Tools;
  agent?: Agent;
  preventChatPersistence?: boolean;

  webSearchNumResults?: number;
  ragMaxResources?: number;
  minRagResourcesScore?: number;
}

export interface UseChatHubInstanceResult
  extends UseChatSessionResult,
    ChatConfig {
  chatId: string;
  model: chatModelId;
  dataPart: DataUIPart<ChatbotDataPart> | undefined;
  setConfig: SetChatConfig;
}

export const useChatHubInstance = ({
  chatId,
  model,
  submitSubscribe,
  initialMessages,
  projectId,
  temperature,
  topP,
  topK,
  systemPrompt,
  agent = "rag",
  preventChatPersistence = false,

  webSearchNumResults = defaultWebSearchNumResults,
  ragMaxResources = defaultRagMaxResources,
  minRagResourcesScore = defaultMinRagScore,
}: UseChatHubInstanceConfig): UseChatHubInstanceResult => {
  const { dataPart, setDataPart } = useChatDataPartState();
  // Instance owns its own session + UI state.
  const chatResult = useChatSession({
    initialMessages,
    api: "/api/chat",
    onDataPart: setDataPart,
    throttleMs: 200,
  });

  const chatConfig = useMemo<ChatConfig>(() => {
    const modelConfig = getChatConfigurationByModelId(model);
    return {
      selectedModel: model,
      temperature: temperature ?? modelConfig.temperature,
      topP: topP ?? modelConfig.topP,
      topK: topK ?? modelConfig.topK,

      webSearchNumResults,
      ragMaxResources,
      minRagResourcesScore,
    };
  }, [
    model,
    temperature,
    topP,
    topK,
    webSearchNumResults,
    ragMaxResources,
    minRagResourcesScore,
  ]);

  const body = useChatRequestBody({
    chatId,
    validQueryParamChatId: undefined,
    projectId,
    preventChatPersistence,
    agent,
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
    ...chatConfig,
    setConfig: () => {}, // No-op, managed by parent
    chatId,
    model,
    dataPart,
  };
};
