"use client";

import { useCallback } from "react";
import type { ChatBody, ChatConfig, SetChatConfig } from "./hook-types";
import type { ChatbotMessage, ChatMode } from "@/lib/features/chat/types";

export interface UseChatReloadArgs {
  regenerate: (options?: {
    messageId?: string;
    body?: object;
  }) => Promise<void>;
  messages: ChatbotMessage[];
  body: ChatBody;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setConfig: SetChatConfig;
  setChatMode: (chatMode: ChatMode) => void;
}

export interface UseChatReloadResult {
  reload: (reloadConfig?: Partial<ChatConfig> & { chatMode?: ChatMode }) => void;
}

export const useChatReload = ({
  regenerate,
  messages,
  body,
  setInput,
  setConfig,
  setChatMode,
}: UseChatReloadArgs): UseChatReloadResult => {
  const reload = useCallback(
    (reloadConfig: Partial<ChatConfig> & { chatMode?: ChatMode } = {}) => {
      setInput("");

       
      const { chatMode, ...config } = reloadConfig;

      void regenerate({
        messageId: messages.at(-1)?.id,
        body: {
          ...body,
          ...config,
          ...(chatMode && { chatMode }),
        },
      });

      if (Object.keys(config).length > 0) {
        setConfig(config);
      }

      if (chatMode) {
        setChatMode(chatMode);
      }
    },
    [body, messages, regenerate, setConfig, setInput, setChatMode],
  );

  return { reload };
};
