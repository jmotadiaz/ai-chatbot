"use client";

import React, { createContext, useContext } from "react";
import {
  defaultModel,
  defaultTemperature,
  CHAT_MODELS,
  defaultRagMaxResources,
  defaultWebSearchNumResults,
} from "@/lib/ai/models/definition";
import {
  UseChatResult,
  UseChatArgs,
  useChat,
} from "@/lib/features/chat/hooks/use-chat";

const chatContext = createContext<UseChatResult>({
  selectedModel: defaultModel,
  temperature: defaultTemperature,
  ragMaxResources: defaultRagMaxResources,
  webSearchNumResults: defaultWebSearchNumResults,
  setConfig: () => {},
  input: "",
  files: [],
  setInput: () => {},
  setFiles: () => {},
  handleInputChange: () => {},
  handleFileChange: () => {},
  handleSubmit: async () => {},
  id: "",
  messages: [],
  setMessages: () => {},
  status: "ready",
  stop: async () => {},
  error: undefined,
  tools: [],
  sendEnabled: false,
  sendMessage: async () => {},
  regenerate: async () => {
    return undefined;
  },
  clearError: () => {},
  reload: async () => {},
  resumeStream: async () => {},
  addToolResult: async () => {},
  toggleTool: () => {},
  hasTool: () => false,
  setTools: () => {},
  availableModels: CHAT_MODELS,
  dataPart: undefined,
});

export interface ChatProviderProps extends UseChatArgs {
  children: React.ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({
  children,
  ...props
}) => {
  const chatResult = useChat(props);

  return (
    <chatContext.Provider value={chatResult}>{children}</chatContext.Provider>
  );
};

export const useChatContext = () => useContext(chatContext);
export type { UseChatResult as ChatContext };
