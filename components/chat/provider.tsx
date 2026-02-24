"use client";

import React, { createContext, useContext } from "react";
import {
  CHAT_MODELS,
  defaultModel,
  defaultRagMaxResources,
  defaultMinRagScore,
  defaultWebSearchNumResults,
} from "@/lib/features/foundation-model/config";
import {
  UseChatResult,
  UseChatArgs,
  useChat,
} from "@/lib/features/chat/conversation/hooks/use-chat";

const chatContext = createContext<UseChatResult>({
  selectedModel: defaultModel,
  temperature: undefined,
  topP: undefined,
  topK: undefined,

  webSearchNumResults: defaultWebSearchNumResults,
  ragMaxResources: defaultRagMaxResources,
  minRagResourcesScore: defaultMinRagScore, // Fixed from defaultMinRagResourcesScore
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
  sendEnabled: false,
  sendMessage: async () => {},
  regenerate: async () => {
    return undefined;
  },
  clearError: () => {},
  reload: async () => {},
  resumeStream: async () => {},
  addToolResult: async () => {},
  addToolOutput: async () => {},
  addToolApprovalResponse: async () => {},
  agent: "rag",
  setAgent: () => {},
  availableModels: CHAT_MODELS,
  dataPart: undefined,
  isNewChat: false,
  preventChatPersistence: false,
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
