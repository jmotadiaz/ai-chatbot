"use client";

import { useState } from "react";
import type { ChatMode } from "@/lib/features/chat/types";

export interface UseChatModeResult {
  chatMode: ChatMode;
  setChatMode: (chatMode: ChatMode) => void;
}

export const useChatMode = (
  initialChatMode: ChatMode = "auto",
): UseChatModeResult => {
  const [chatMode, setChatMode] = useState<ChatMode>(initialChatMode);

  return {
    chatMode,
    setChatMode,
  };
};
