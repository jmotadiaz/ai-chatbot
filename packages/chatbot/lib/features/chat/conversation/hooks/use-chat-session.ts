"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { useChat as useAiSdkChat } from "@ai-sdk/react";
import type { DataUIPart } from "ai";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import { v4 } from "uuid";
import type { ChatbotDataPart, ChatbotMessage } from "@/lib/features/chat/types";

export interface UseChatSessionArgs {
  initialMessages?: ChatbotMessage[];
  api?: string;
  throttleMs?: number;
  onDataPart?: (dataPart: DataUIPart<ChatbotDataPart>) => void | Promise<void>;
  onChatId?: (chatId: string) => void | Promise<void>;
  onFinish?: () => void | Promise<void>;
}

export type UseChatSessionResult = UseChatHelpers<ChatbotMessage>;

export const useChatSession = ({
  initialMessages,
  api = "/api/chat",
  throttleMs = 200,
  onDataPart,
  onChatId,
  onFinish,
}: UseChatSessionArgs): UseChatSessionResult => {
  return useAiSdkChat({
    messages: initialMessages,
    generateId: v4,
    experimental_throttle: throttleMs,
    transport: new DefaultChatTransport({ api }),
    onData: (incoming) => {
      const incomingDataPart = incoming as DataUIPart<ChatbotDataPart>;
      void onDataPart?.(incomingDataPart);
      if (incomingDataPart.type === "data-chat") {
        void onChatId?.(incomingDataPart.data.id);
      }
    },
    onFinish,
    onError: (error) => {
      toast.error(
        error.message.length > 0
          ? error.message
          : "An error happened, please try again later.",
        { position: "top-center", richColors: true }
      );
    },
  });
};


