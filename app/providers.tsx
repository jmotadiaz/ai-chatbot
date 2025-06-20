"use client";
import React, { useCallback, useContext, useState, createContext } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { useChat, UseChatHelpers } from "@ai-sdk/react";
import { toast } from "sonner";
import { UIMessage } from "ai";
import {
  defaultModel,
  defaultTemperature,
  defaultTopP,
  chatModelId,
} from "@/lib/ai/providers";
import { generateUUID } from "@/lib/utils";

interface ProvidersProps {
  children: React.ReactNode;
}

export const Providers: React.FC<ProvidersProps> = ({ children }) => {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="data-color-mode"
        enableSystem
        defaultTheme="system"
      >
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
};

interface ChatConfig {
  selectedModel: chatModelId;
  temperature: number;
  topP: number;
  systemPrompt?: string;
}

interface SetChatConfig {
  setConfig: (config: Partial<ChatConfig>) => void;
}

const chatContext = createContext<
  UseChatHelpers &
    SetChatConfig &
    ChatConfig & {
      selectedModel: chatModelId;
      metaPrompt?: string | null;
      chatId?: string;
      title?: string;
      projectId?: string;
    }
>({
  selectedModel: defaultModel,
  temperature: 0.2,
  topP: 0.95,
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
  projectId?: string;
  chatId?: string;
  selectedModel?: chatModelId;
  temperature?: number;
  topP?: number;
  systemPrompt?: string;
  metaPrompt?: string | null;
  title?: string;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({
  children,
  initialMessages,
  selectedModel = defaultModel,
  temperature = defaultTemperature,
  topP = defaultTopP,
  systemPrompt,
  metaPrompt,
  chatId,
  projectId,
  title,
}) => {
  const [chatConfig, setChatConfig] = useState<ChatConfig>({
    selectedModel,
    temperature,
    topP,
    systemPrompt,
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
        projectId,
        metaPrompt,
        chatId,
        setConfig,
        ...chatResult,
        ...chatConfig,
        title,
      }}
    >
      {children}
    </chatContext.Provider>
  );
};

export interface SidebarContext {
  showSidebar: boolean;
  setShowSidebar: (showSidebar: boolean) => void;
  toggleSidebar: () => void;
}

const sidebarContext = createContext<SidebarContext>({
  showSidebar: false,
  setShowSidebar: () => {},
  toggleSidebar: () => {},
});

export const SidebarProvider: React.FC<ProvidersProps> = ({ children }) => {
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
};

export const useSidebarContext = () => useContext(sidebarContext);
export const useChatContext = () => useContext(chatContext);
