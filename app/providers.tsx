"use client";
import { randomUUID } from "crypto";
import React, { useCallback, useContext, useState, createContext } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { useChat, UseChatHelpers } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import {
  defaultModel,
  defaultTemperature,
  defaultTopP,
  chatModelId,
  defaultTopK,
  getChatConfigurationByModelId,
} from "@/lib/ai/models";
import { ChatbotMessage } from "@/lib/ai/types";

interface ProvidersProps {
  children: React.ReactNode;
}

const generateId =
  typeof window !== "undefined" ? () => window.crypto.randomUUID() : randomUUID;

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
  topK: number;
  useRAG: boolean;
  useWebSearch: boolean;
}

interface SetChatConfig {
  setConfig: (config: Partial<ChatConfig>) => void;
}

interface InputState {
  input: string;
  setInput: (input: string) => void;
  handleInputChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}

const chatContext = createContext<
  UseChatHelpers<ChatbotMessage> &
    SetChatConfig &
    ChatConfig &
    InputState & {
      selectedModel: chatModelId;
      metaPrompt?: string | null;
      chatId?: string;
      title?: string;
      projectId?: string;
      reload: () => void;
    }
>({
  selectedModel: defaultModel,
  temperature: defaultTemperature,
  topP: defaultTopP,
  topK: defaultTopK,
  useRAG: false,
  useWebSearch: false,
  setConfig: () => {},
  input: "",
  setInput: () => {},
  handleInputChange: () => {},
  handleSubmit: async () => {},
  id: "",
  messages: [],
  setMessages: () => {},
  status: "ready",
  stop: async () => {},
  error: undefined,
  sendMessage: async () => {},
  regenerate: async () => {
    return undefined;
  },
  reload: async () => {},
  resumeStream: async () => {},
  addToolResult: async () => {},
});

export interface ChatProviderProps extends ProvidersProps {
  initialMessages?: ChatbotMessage[];
  projectId?: string;
  chatId?: string;
  selectedModel?: chatModelId;
  temperature?: number;
  topP?: number;
  topK?: number;
  systemPrompt?: string;
  metaPrompt?: string | null;
  title?: string;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({
  children,
  initialMessages,
  selectedModel = defaultModel,
  temperature,
  topP,
  topK,
  systemPrompt,
  metaPrompt,
  chatId,
  projectId,
  title,
}) => {
  const [chatConfig, setChatConfig] = useState<ChatConfig>(() =>
    Object.assign(
      getChatConfigurationByModelId(selectedModel),
      Object.fromEntries(
        Object.entries({
          temperature,
          topP,
          topK,
          systemPrompt,
        }).filter(([, value]) => value !== undefined && value !== null)
      ),
      { selectedModel, useRAG: false, useWebSearch: false }
    )
  );

  // Manual input state management for v5
  const [input, setInput] = useState("");

  const chatResult = useChat({
    messages: initialMessages,
    generateId,
    experimental_throttle: 200,
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),

    onError: (error) => {
      toast.error(
        error.message.length > 0
          ? error.message
          : "An error happened, please try again later.",
        { position: "top-center", richColors: true }
      );
    },
  });

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(event.target.value);
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (input.trim()) {
        setInput("");
        await chatResult.sendMessage(
          {
            text: input,
          },
          {
            body: {
              chatId,
              ...chatConfig,
            },
          }
        );
      }
    },
    [input, chatResult, chatId, chatConfig]
  );

  const setConfig = useCallback<SetChatConfig["setConfig"]>((config) => {
    setChatConfig((prev) => ({
      ...prev,
      ...config,
    }));
  }, []);

  const reload = useCallback(() => {
    setInput("");
    chatResult.regenerate({
      messageId: chatResult.messages.at(-1)?.id,
      body: { chatId, ...chatConfig },
    });
  }, [chatConfig, chatId, chatResult]);

  return (
    <chatContext.Provider
      value={{
        projectId,
        metaPrompt,
        chatId,
        setConfig,
        input,
        setInput,
        handleInputChange,
        handleSubmit,
        reload,
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
