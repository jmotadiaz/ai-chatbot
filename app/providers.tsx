"use client";
import { randomUUID } from "crypto";
import React, {
  useCallback,
  useContext,
  useState,
  createContext,
  useMemo,
} from "react";
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
} from "@/lib/ai/models/definition";
import { ChatbotMessage } from "@/lib/ai/types";
import { Tool, Tools } from "@/lib/ai/tools/types";

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

export interface ChatConfig {
  selectedModel: chatModelId;
  temperature: number;
  topP: number;
  systemPrompt?: string;
  topK: number;
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
      tools: Tools;
      toggleTool: (tool: Tool) => void;
      hasTool: (tool: Tool) => boolean;
      setTools: (tools: Tools) => void;
    }
>({
  selectedModel: defaultModel,
  temperature: defaultTemperature,
  topP: defaultTopP,
  topK: defaultTopK,
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
  tools: [],
  sendMessage: async () => {},
  regenerate: async () => {
    return undefined;
  },
  reload: async () => {},
  resumeStream: async () => {},
  addToolResult: async () => {},
  toggleTool: () => {},
  hasTool: () => false,
  setTools: () => {},
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
  tools?: Tools;
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
  tools = [],
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
  const [selectedTools, setSelectedTools] = useState<Tools>(tools || []);

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

  const body = useMemo(() => {
    return {
      chatId,
      ...chatConfig,
      tools: selectedTools,
    };
  }, [chatConfig, chatId, selectedTools]);

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
            body,
          }
        );
      }
    },
    [input, chatResult, body]
  );

  const setConfig = useCallback<SetChatConfig["setConfig"]>((config) => {
    setChatConfig((prev) => ({
      ...prev,
      ...config,
    }));
  }, []);

  const toggleTool = useCallback((tool: Tool) => {
    setSelectedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  }, []);

  const hasTool = useCallback(
    (tool: Tool) => {
      return selectedTools.includes(tool);
    },
    [selectedTools]
  );

  const reload = useCallback(() => {
    setInput("");
    chatResult.regenerate({
      messageId: chatResult.messages.at(-1)?.id,
      body,
    });
  }, [body, chatResult]);

  return (
    <chatContext.Provider
      value={{
        ...chatResult,
        ...chatConfig,
        projectId,
        metaPrompt,
        chatId,
        setConfig,
        input,
        setInput,
        handleInputChange,
        handleSubmit,
        reload,
        title,
        tools: selectedTools,
        toggleTool,
        hasTool,
        setTools: setSelectedTools,
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
