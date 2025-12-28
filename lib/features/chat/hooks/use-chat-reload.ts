"use client";

import { useCallback } from "react";
import type { ChatBody, ChatConfig, SetChatConfig } from "./hook-types";
import type { ChatbotMessage } from "@/lib/features/chat/types";

export interface UseChatReloadArgs {
  regenerate: (
    options?: {
      messageId?: string;
      body?: object;
    }
  ) => Promise<void>;
  messages: ChatbotMessage[];
  body: ChatBody;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setConfig: SetChatConfig;
}

export interface UseChatReloadResult {
  reload: (reloadConfig?: Partial<ChatConfig>) => void;
}

export const useChatReload = ({
  regenerate,
  messages,
  body,
  setInput,
  setConfig,
}: UseChatReloadArgs): UseChatReloadResult => {
  const reload = useCallback(
    (reloadConfig: Partial<ChatConfig> = {}) => {
      setInput("");
      void regenerate({
        messageId: messages.at(-1)?.id,
        body: {
          ...body,
          ...reloadConfig,
        },
      });
      if (reloadConfig) {
        setConfig(reloadConfig);
      }
    },
    [body, messages, regenerate, setConfig, setInput]
  );

  return { reload };
};


