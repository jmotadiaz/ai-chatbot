"use client";

import { useMemo, useState } from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { DataUIPart } from "ai";
import { useChatInputState } from "./use-chat-input-state";
import { useChatSession } from "./use-chat-session";
import { useChatSubmit } from "./use-chat-submit";
import { useChatDataPartState } from "./use-chat-data-part-state";
import { useChatSendEnabled } from "./use-chat-send-enabled";
import { useChatConfig } from "./use-chat-config";
import { useAvailableModels } from "./use-available-models";
import { useSupportedFiles } from "./use-supported-files";
import { useHandleFileChange } from "./use-handle-file-change";
import type { SetChatConfig } from "./hook-types";
import type {
  ChatbotDataPart,
  ChatbotMessage,
  Tools,
} from "@/lib/features/chat/types";
import {
  CHAT_MODELS,
  defaultModel,
  type chatModelId,
} from "@/lib/features/foundation-model/config";
import type { FilePart } from "@/lib/features/attachment/types";
import type { ModelConfiguration } from "@/lib/features/foundation-model/types";

export interface UseContext7ChatResult extends UseChatHelpers<ChatbotMessage> {
  input: string;
  setInput: (input: string) => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  sendMessage: () => Promise<void>;
  sendEnabled: boolean;
  dataPart: DataUIPart<ChatbotDataPart> | undefined;
  handleInputChange: (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>,
  ) => void;
  selectedModel: chatModelId;
  setConfig: SetChatConfig;
  files: FilePart[];
  setFiles: React.Dispatch<React.SetStateAction<FilePart[]>>;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  supportedFiles: Required<ModelConfiguration>["supportedFiles"];
  availableModels: chatModelId[];
}

export const useContext7Chat = (): UseContext7ChatResult => {
  const { dataPart, setDataPart } = useChatDataPartState();

  const chatResult = useChatSession({
    api: "/api/context7",
    throttleMs: 200,
    onDataPart: setDataPart,
  });

  const { chatConfig, setConfig } = useChatConfig({
    selectedModel: defaultModel,
  });
  const { selectedModel } = chatConfig;

  const { input, setInput, handleInputChange } = useChatInputState("");
  const [files, setFiles] = useState<FilePart[]>([]);

  // We don't use tools for Context7 chat for now
  const tools: Tools = useMemo(() => [], []);

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

  const sendEnabled = useChatSendEnabled({ input, files });

  const body = useMemo(
    () => ({
      tools: [],
      selectedModel: selectedModel,
      webSearchNumResults: chatConfig.webSearchNumResults,
      preventChatPersistence: true,
    }),
    [selectedModel, chatConfig.webSearchNumResults],
  );

  const { handleSubmit, sendMessage } = useChatSubmit({
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

  return {
    ...chatResult,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    sendMessage,
    sendEnabled,
    dataPart,
    selectedModel,
    setConfig,
    files,
    setFiles,
    handleFileChange,
    supportedFiles,
    availableModels,
  };
};
