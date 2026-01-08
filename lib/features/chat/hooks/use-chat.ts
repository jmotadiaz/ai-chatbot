"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { DataUIPart } from "ai";
import { useState } from "react";
import {
  type ChatConfig,
  type ChatTools,
  type InputState,
  type SetChatConfig,
} from "./hook-types";
import { useAvailableModels } from "./use-available-models";
import { useChatConfig } from "./use-chat-config";
import { useChatTools } from "./use-chat-tools";
import { useHandleFileChange } from "./use-handle-file=change";
import { useChatInputState } from "./use-chat-input-state";
import { useChatSendEnabled } from "./use-chat-send-enabled";
import { useChatSubmit } from "./use-chat-submit";
import { useChatDataPartState } from "./use-chat-data-part-state";
import { useChatQueryParamId } from "./use-chat-query-param-id";
import { useChatReload } from "./use-chat-reload";
import { useChatRequestBody } from "./use-chat-request-body";
import { useChatSession } from "./use-chat-session";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import {
  CHAT_MODELS,
  defaultModel,
  defaultRagMaxResources,
  defaultWebSearchNumResults,
} from "@/lib/features/foundation-model/config";
import type {
  ChatbotDataPart,
  ChatbotMessage,
  Tools,
} from "@/lib/features/chat/types";
import { useSupportedFiles } from "@/lib/features/chat/hooks/use-supported-files";
import { FilePart } from "@/lib/features/attachment/types";

export interface UseChatArgs {
  initialMessages?: ChatbotMessage[];
  projectId?: string;
  chatId?: string;
  isNewChat?: boolean;
  selectedModel?: chatModelId;
  temperature?: number;
  topP?: number;
  topK?: number;
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
  isNewChat: boolean;
  preventChatPersistence: boolean;
}

export const useChat = ({
  initialMessages,
  selectedModel = defaultModel,
  temperature,
  topP,
  topK,
  systemPrompt,
  metaPrompt,
  chatId,
  isNewChat = false,
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
    topP,
    topK,
    ragMaxResources,
    webSearchNumResults,
  });
  const { tools, setTools, hasTool, toggleTool } = useChatTools(initialTools);
  const { setQueryParamChatId, validQueryParamChatId } = useChatQueryParamId();
  const { dataPart, setDataPart } = useChatDataPartState();
  const effectiveChatId = chatId || validQueryParamChatId;

  const chatResult = useChatSession({
    initialMessages,
    api: "/api/chat",
    throttleMs: 200,
    onDataPart: setDataPart,
    onFinish: async () => {
      if (!isNewChat) return;
      if (preventChatPersistence) return;
      if (!effectiveChatId) return;
      await setQueryParamChatId(effectiveChatId);
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

  const { input, setInput, handleInputChange } = useChatInputState("");
  const [files, setFiles] = useState<FilePart[]>([]);
  const sendEnabled = useChatSendEnabled({ input, files });
  const { handleSubmit } = useChatSubmit({
    sendMessage: chatResult.sendMessage,
    body,
    input,
    files,
    sendEnabled,
    onBeforeSubmit: () => {
      setInput("");
      setFiles([]);
    },
  });

  const availableModels = useAvailableModels({
    models: CHAT_MODELS,
    messages: chatResult.messages,
    tools,
    files,
  });

  const supportedFiles = useSupportedFiles({
    selectedModels: [selectedModel],
    availableModels,
  });

  const { handleFileChange } = useHandleFileChange({
    setFiles,
    supportedFiles,
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
    isNewChat,
    preventChatPersistence,
  };
};
