"use client";

import React, { createContext, useContext } from "react";
import {
  UseContext7ChatResult,
  useContext7Chat,
} from "@/lib/features/chat/hooks/use-context7-chat";
import {
  CHAT_MODELS,
  defaultModel,
} from "@/lib/features/foundation-model/config";

const context7Context = createContext<UseContext7ChatResult>({
  selectedModel: defaultModel,
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
  availableModels: CHAT_MODELS,
  dataPart: undefined,
  supportedFiles: [],
  addToolResult: async () => {},
  regenerate: async () => undefined,
  resumeStream: async () => {},
  addToolOutput: async () => {},
  addToolApprovalResponse: async () => {},
  clearError: () => {},
});

export const Context7Provider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const chatResult = useContext7Chat();

  return (
    <context7Context.Provider value={chatResult}>
      {children}
    </context7Context.Provider>
  );
};

export const useContext7ChatContext = () => useContext(context7Context);
