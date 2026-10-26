"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { useChat as useAiSdkChat } from "@ai-sdk/react";
import type { ChatOnFinishCallback, DataUIPart } from "ai";
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
  /**
   * Stable chat id (persisted chats): becomes the SDK chat id, which the
   * default resume URL (`${api}/${chatId}/stream`) and the server's
   * "latest stream per chat" index resolve against.
   */
  id?: string;
  /**
   * Reads the CURRENT turn's resume key at request time. The transport is
   * constructed once, so this must read a ref, not a closed-over value.
   * When it returns a key the resume GET goes to `${api}/${key}/stream`
   * (per-turn registry entry); when it does not, the SDK's default
   * `${api}/${chatId}/stream` is used (resolved via the chatId index).
   */
  getStreamKey?: () => string | undefined;
  /** Full SDK callback args: the app needs `isAbort`/`isDisconnect`/`isError`. */
  onFinish?: ChatOnFinishCallback<ChatbotMessage>;
}

export type UseChatSessionResult = UseChatHelpers<ChatbotMessage>;

export const useChatSession = ({
  initialMessages,
  api = "/api/chat",
  throttleMs = 200,
  onDataPart,
  onChatId,
  id,
  getStreamKey,
  onFinish,
}: UseChatSessionArgs): UseChatSessionResult => {
  // No `resume: true`: the SDK's unconditional mount probe (a `GET` on every
  // chat open) raced the user's send — its silent `204` hid the loading state
  // mid-stream and could attach to a brand-new turn. Mount resume is gated
  // by `useChatResume` (reload/back_forward navigation only).
  return useAiSdkChat({
    messages: initialMessages,
    id,
    generateId: v4,
    experimental_throttle: throttleMs,
    transport: new DefaultChatTransport({
      api,
      prepareReconnectToStreamRequest: ({ api: defaultApi }) => {
        const streamKey = getStreamKey?.();
        return streamKey ? { api: `${defaultApi}/${streamKey}/stream` } : {};
      },
    }),
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
