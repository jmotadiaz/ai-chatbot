"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { DataUIPart } from "ai";
import {
  ChatConfig,
  ChatTools,
  InputState,
  SetChatConfig,
  useChatConfig,
  useChatTools,
  useChatHandler,
  useAvailableModels,
} from "./use-chat-handler";
import { useChatDataPartState } from "./use-chat-data-part-state";
import { useChatQueryParamId } from "./use-chat-query-param-id";
import { useChatReload } from "./use-chat-reload";
import { useChatRequestBody } from "./use-chat-request-body";
import { useChatSession } from "./use-chat-session";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { CHAT_MODELS } from "@/lib/features/foundation-model/config";
import {
  defaultModel,
  defaultRagMaxResources,
  defaultWebSearchNumResults,
} from "@/lib/features/foundation-model/constants";
import type {
  ChatbotDataPart,
  ChatbotMessage,
  Tools,
} from "@/lib/features/chat/types";

export interface UseChatArgs {
  initialMessages?: ChatbotMessage[];
  projectId?: string;
  chatId?: string;
  selectedModel?: chatModelId;
  temperature?: number;
  systemPrompt?: string;
  metaPrompt?: string | null;
  title?: string;
  tools?: Tools;
  preventChatPersistence?: boolean;
  ragSimilarityPercentage?: number;
  ragMaxResources?: number;
  webSearchNumResults?: number;
}

export interface UseChatResult
  extends UseChatHelpers<ChatbotMessage>,
    ChatConfig,
    ChatTools,
    InputState {
  selectedModel: chatModelId;
  metaPrompt?: string | null;
  chatId?: string;
  title?: string;
  projectId?: string;
  reload: (reloadConfig?: Partial<ChatConfig>) => void;
  sendEnabled: boolean;
  dataPart: DataUIPart<ChatbotDataPart> | undefined;
  setConfig: SetChatConfig;
  availableModels: chatModelId[];
}

export const useChat = ({
  initialMessages,
  selectedModel = defaultModel,
  temperature,
  systemPrompt,
  metaPrompt,
  chatId,
  projectId,
  title,
  preventChatPersistence = false,
  tools: initialTools = [],
  ragMaxResources = defaultRagMaxResources,
  webSearchNumResults = defaultWebSearchNumResults,
}: UseChatArgs): UseChatResult => {
  const { chatConfig, setConfig } = useChatConfig({
    selectedModel,
    temperature,
    ragMaxResources,
    webSearchNumResults,
  });
  const { tools, setTools, hasTool, toggleTool } = useChatTools(initialTools);
  const { setQueryParamChatId, validQueryParamChatId } = useChatQueryParamId();
  const { dataPart, setDataPart } = useChatDataPartState();

  const chatResult = useChatSession({
    initialMessages,
    api: "/api/chat",
    throttleMs: 200,
    onDataPart: setDataPart,
    onChatId: async (newChatId) => {
      await setQueryParamChatId(newChatId);
    },
  });

  const body = useChatRequestBody({
    chatId,
    validQueryParamChatId,
    projectId,
    preventChatPersistence,
    tools,
    systemPrompt,
    chatConfig,
  });

  const {
    input,
    setInput,
    files,
    setFiles,
    handleFileChange,
    handleInputChange,
    handleSubmit,
    sendEnabled,
  } = useChatHandler({
    selectedModel: chatConfig.selectedModel,
    chatResult,
    body,
  });

  const availableModels = useAvailableModels({
    models: CHAT_MODELS,
    messages: chatResult.messages,
    tools,
    files,
  });

  const { reload } = useChatReload({
    regenerate: chatResult.regenerate,
    messages: chatResult.messages,
    body,
    setInput,
    setConfig,
  });

  return {
    ...chatResult,
    ...chatConfig,
    projectId,
    metaPrompt,
    chatId,
    setConfig,
    input,
    setInput,
    setFiles,
    files,
    dataPart,
    handleInputChange,
    handleFileChange,
    handleSubmit,
    reload,
    title,
    sendEnabled,
    availableModels,
    tools,
    toggleTool,
    hasTool,
    setTools,
  };
};
