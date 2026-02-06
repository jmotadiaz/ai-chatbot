"use client";

import { useMemo } from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { DataUIPart } from "ai";
import { useChatInputState } from "./use-chat-input-state";
import { useChatSession } from "./use-chat-session";
import { useChatSubmit } from "./use-chat-submit";
import { useChatDataPartState } from "./use-chat-data-part-state";
import { useChatSendEnabled } from "./use-chat-send-enabled";
import type {
  ChatbotDataPart,
  ChatbotMessage,
} from "@/lib/features/chat/types";
import {
  defaultModel,
  defaultWebSearchNumResults,
} from "@/lib/features/foundation-model/config";

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
}

export const useContext7Chat = (): UseContext7ChatResult => {
  const { dataPart, setDataPart } = useChatDataPartState();

  const chatResult = useChatSession({
    api: "/api/context7",
    throttleMs: 200,
    onDataPart: setDataPart,
  });

  const { input, setInput, handleInputChange } = useChatInputState("");

  // We don't support file attachments for Context7 chat yet, passing empty array
  const files = useMemo(() => [], []);
  const sendEnabled = useChatSendEnabled({ input, files });

  const body = useMemo(
    () => ({
      tools: [],
      selectedModel: defaultModel,
      webSearchNumResults: defaultWebSearchNumResults,
      preventChatPersistence: true,
    }),
    [],
  );

  const { handleSubmit, sendMessage } = useChatSubmit({
    sendMessage: chatResult.sendMessage,
    body,
    input,
    files,
    sendEnabled,
    onBeforeSubmit: () => {
      setInput("");
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
  };
};
