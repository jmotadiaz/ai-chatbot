"use client";

import React, { createContext, useContext } from "react";

export interface ChatLifecycleContextValue {
  startNewChat: () => void;
}

const chatLifecycleContext = createContext<ChatLifecycleContextValue>({
  startNewChat: () => { },
});

export interface ChatLifecycleProviderProps extends ChatLifecycleContextValue {
  children: React.ReactNode;
}

export const ChatLifecycleProvider: React.FC<ChatLifecycleProviderProps> = ({
  children,
  startNewChat,
}) => {
  return (
    <chatLifecycleContext.Provider value={{ startNewChat }}>
      {children}
    </chatLifecycleContext.Provider>
  );
};

export const useChatLifecycle = (): ChatLifecycleContextValue =>
  useContext(chatLifecycleContext);


