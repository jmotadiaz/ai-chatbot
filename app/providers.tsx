"use client";
import React, { useCallback, useContext, useState } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { useChat, UseChatHelpers } from "@ai-sdk/react";
import { generateUUID } from "@/lib/utils";
import { toast } from "sonner";
import { defaultModel, modelID } from "../lib/ai/providers";
import { UIMessage } from "ai";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" enableSystem defaultTheme="system">
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}

interface ChatConfig {
  selectedModel: modelID;
  temperature: number;
  topP: number;
  topK: number;
}

interface SetChatConfig {
  setConfig: (config: Partial<ChatConfig>) => void;
}

const chatContext = React.createContext<
  UseChatHelpers & SetChatConfig & ChatConfig & { selectedModel: modelID }
>({
  selectedModel: defaultModel,
  temperature: 0.2,
  topP: 0.95,
  topK: 30,
  setConfig: () => {},
  id: "",
  messages: [],
  setMessages: () => {},
  input: "",
  setInput: () => {},
  handleInputChange: () => {},
  handleSubmit: () => {},
  status: "ready",
  stop: () => {},
  error: undefined,
  isLoading: false,
  append: async () => {
    return undefined;
  },
  reload: async () => {
    return undefined;
  },
  setData: () => {},
});

export interface ChatProviderProps extends ProvidersProps {
  initialMessages?: UIMessage[];
  chatId?: string;
  selectedModel?: modelID;
}

export function ChatProvider({
  children,
  initialMessages,
  selectedModel = defaultModel,
  chatId,
}: ChatProviderProps) {
  const [chatConfig, setChatConfig] = useState<ChatConfig>({
    selectedModel,
    temperature: 0.2,
    topP: 0.95,
    topK: 30,
  });
  const chatResult = useChat({
    initialMessages,
    generateId: generateUUID,
    sendExtraMessageFields: true,
    maxSteps: 5,
    experimental_throttle: 400,
    body: {
      chatId,
      ...chatConfig,
    },
    onError: (error) => {
      toast.error(
        error.message.length > 0
          ? error.message
          : "An error happened, please try again later.",
        { position: "top-center", richColors: true }
      );
    },
  });

  const setConfig = useCallback<SetChatConfig["setConfig"]>((config) => {
    setChatConfig((prev) => ({
      ...prev,
      ...config,
    }));
  }, []);

  return (
    <chatContext.Provider
      value={{
        setConfig,
        ...chatResult,
        ...chatConfig,
      }}
    >
      {children}
    </chatContext.Provider>
  );
}

export interface SidebarContext {
  showSidebar: boolean;
  setShowSidebar: (showSidebar: boolean) => void;
  toggleSidebar: () => void;
}

const sidebarContext = React.createContext<SidebarContext>({
  showSidebar: false,
  setShowSidebar: () => {},
  toggleSidebar: () => {},
});

export function SidebarProvider({ children }: ProvidersProps) {
  const [showSidebar, setShowSidebar] = useState(false);
  const toggleSidebar = useCallback(() => {
    setShowSidebar((prev) => !prev);
  }, []);
  return (
    <sidebarContext.Provider
      value={{ showSidebar, setShowSidebar, toggleSidebar }}
    >
      {children}
    </sidebarContext.Provider>
  );
}

export const useSidebarContext = () => useContext(sidebarContext);
export const useChatContext = () => useContext(chatContext);
