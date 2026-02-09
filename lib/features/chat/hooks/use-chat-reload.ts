"use client";

import { useCallback } from "react";
import type { ChatBody, ChatConfig, SetChatConfig } from "./hook-types";
import type { ChatbotMessage, Agent } from "@/lib/features/chat/types";

export interface UseChatReloadArgs {
  regenerate: (options?: {
    messageId?: string;
    body?: object;
  }) => Promise<void>;
  messages: ChatbotMessage[];
  body: ChatBody;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setConfig: SetChatConfig;
  setAgent: (agent: Agent) => void;
}

export interface UseChatReloadResult {
  reload: (reloadConfig?: Partial<ChatConfig> & { agent?: Agent }) => void;
}

export const useChatReload = ({
  regenerate,
  messages,
  body,
  setInput,
  setConfig,
  setAgent,
}: UseChatReloadArgs): UseChatReloadResult => {
  const reload = useCallback(
    (reloadConfig: Partial<ChatConfig> & { agent?: Agent } = {}) => {
      setInput("");

       
      const { agent, ...config } = reloadConfig;

      void regenerate({
        messageId: messages.at(-1)?.id,
        body: {
          ...body,
          ...config,
          ...(agent && { agent }),
        },
      });

      if (Object.keys(config).length > 0) {
        setConfig(config);
      }

      if (agent) {
        setAgent(agent);
      }
    },
    [body, messages, regenerate, setConfig, setInput, setAgent],
  );

  return { reload };
};
