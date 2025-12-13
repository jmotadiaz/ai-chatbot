"use client";

import { useCallback, useState, useMemo } from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import { useChat as useAiSdkChat } from "@ai-sdk/react";
import type { DataUIPart } from "ai";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import { useQueryState } from "nuqs";
import { v4, validate } from "uuid";
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
import type { chatModelId } from "@/lib/features/models/constants";
import {
  defaultModel,
  defaultRagMaxResources,
  defaultWebSearchNumResults,
} from "@/lib/features/models/constants";
import type { ChatbotDataPart, ChatbotMessage } from "@/lib/types";
import type { Tools } from "@/lib/ai/tools/types";

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
    systemPrompt,
    ragMaxResources,
    webSearchNumResults,
  });
  const { tools, setTools, hasTool, toggleTool } = useChatTools(initialTools);
  const [dataPart, setDataPart] = useState<
    DataUIPart<ChatbotDataPart> | undefined
  >(undefined);
  const [queryParamChatId, setChatId] = useQueryState("chatId");

  const chatResult = useAiSdkChat({
    messages: initialMessages,
    generateId: v4,
    experimental_throttle: 200,
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    onData: (incoming) => {
      const incomingDataPart = incoming as DataUIPart<ChatbotDataPart>;
      setDataPart(incomingDataPart);
      if (incomingDataPart.type === "data-chat") {
        setChatId(incomingDataPart.data.id);
      }
    },
    onError: (error) => {
      toast.error(
        error.message.length > 0
          ? error.message
          : "An error happened, please try again later.",
        { position: "top-center", richColors: true }
      );
    },
  });

  const body = useMemo(() => {
    return {
      chatId:
        chatId || (validate(queryParamChatId) ? queryParamChatId : undefined),
      projectId,
      preventChatPersistence,
      tools,
      ...chatConfig,
    };
  }, [
    queryParamChatId,
    chatId,
    projectId,
    preventChatPersistence,
    chatConfig,
    tools,
  ]);

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
    chatResult,
    tools,
    files,
  });

  const reload = useCallback(
    (reloadConfig: Partial<ChatConfig> = {}) => {
      setInput("");
      chatResult.regenerate({
        messageId: chatResult.messages.at(-1)?.id,
        body: {
          ...body,
          ...reloadConfig,
        },
      });
      if (reloadConfig) {
        setConfig(reloadConfig);
      }
    },
    [body, chatResult, setConfig, setInput]
  );

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
