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
  /**
   * Marks the regenerated turn as resumable (a new per-turn `streamKey` in
   * the body). `undefined` when resume is disabled — the body stays as-is.
   */
  beginTurn?: () => string;
  /**
   * Serialises the regenerate behind an in-flight resume probe (ticket 08):
   * awaited BEFORE `beginTurn()` and the regenerate. `undefined` when
   * resume is disabled (nothing can be in flight).
   */
  resumeGate?: () => Promise<void>;
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
  beginTurn,
  resumeGate,
  setInput,
  setConfig,
  setChatMode,
}: UseChatReloadArgs): UseChatReloadResult => {
  const reload = useCallback(
    (reloadConfig: Partial<ChatConfig> & { chatMode?: ChatMode } = {}) => {
      void (async () => {
        // Never regenerate over an in-flight resume probe (ticket 08): same
        // race as a send — await the probe (or the live turn it attached to)
        // before starting the new one.
        await resumeGate?.();

        setInput("");

        const { chatMode, ...config } = reloadConfig;

        const streamKey = beginTurn?.();

        void regenerate({
          messageId: messages.at(-1)?.id,
          body: {
            ...body,
            ...(streamKey !== undefined && { streamKey }),
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
      })();
    },
    [
      beginTurn,
      body,
      messages,
      regenerate,
      resumeGate,
      setConfig,
      setInput,
      setChatMode,
    ],
  );

  return { reload };
};
