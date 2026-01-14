"use client";

import React, { useState, useCallback, createContext, useContext } from "react";
import { v4 as uuidv4 } from "uuid";
import { ChatLifecycleProvider } from "@/components/chat/lifecycle";

interface ChatLifecycleShellContextValue {
  draftChatId: string;
  startNewChat: () => void;
}

const ChatLifecycleShellContext =
  createContext<ChatLifecycleShellContextValue | null>(null);

export const useChatLifecycleShell = (): ChatLifecycleShellContextValue => {
  const context = useContext(ChatLifecycleShellContext);
  if (!context) {
    throw new Error(
      "useChatLifecycleShell must be used within a ChatLifecycleShell"
    );
  }
  return context;
};

export interface ChatLifecycleShellProps {
  children: React.ReactNode;
}

/**
 * A wrapper component that manages the draft chat ID lifecycle.
 * This should wrap both the Sidebar and the ChatShell so that
 * the startNewChat function is available to components in the Sidebar.
 */
export const ChatLifecycleShell: React.FC<ChatLifecycleShellProps> = ({
  children,
}) => {
  const [draftChatId, setDraftChatId] = useState<string>(() => uuidv4());

  const startNewChat = useCallback(() => {
    setDraftChatId(uuidv4());
  }, []);

  return (
    <ChatLifecycleShellContext.Provider value={{ draftChatId, startNewChat }}>
      <ChatLifecycleProvider startNewChat={startNewChat}>
        {children}
      </ChatLifecycleProvider>
    </ChatLifecycleShellContext.Provider>
  );
};
