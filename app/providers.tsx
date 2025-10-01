"use client";
import React, {
  useCallback,
  useContext,
  useState,
  createContext,
  useMemo,
  useEffect,
} from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { useChat, UseChatHelpers } from "@ai-sdk/react";
import { DataUIPart, DefaultChatTransport } from "ai";
import { toast } from "sonner";
import { usePathname } from "next/navigation";
import { v4, validate } from "uuid";
import { useQueryState } from "nuqs";
import {
  defaultModel,
  defaultTemperature,
  defaultTopP,
  chatModelId,
  defaultTopK,
  CHAT_MODELS,
} from "@/lib/ai/models/definition";
import { ChatbotDataPart, ChatbotMessage } from "@/lib/ai/types";
import { Tool, Tools } from "@/lib/ai/tools/types";
import { getChatConfigurationByModelId } from "@/lib/ai/models/utils";
import { FilePart, handleFileUpload } from "@/lib/ai/utils";

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
  files: FilePart[];
  setInput: (input: string) => void;
  setFiles: React.Dispatch<React.SetStateAction<FilePart[]>>;
  handleInputChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
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
      reload: (reloadConfig?: Partial<ChatConfig>) => void;
      sendEnabled: boolean;
      tools: Tools;
      data: DataUIPart<ChatbotDataPart> | undefined;
      toggleTool: (tool: Tool) => void;
      hasTool: (tool: Tool) => boolean;
      availableModels: chatModelId[];
      setTools: (tools: Tools) => void;
    }
>({
  selectedModel: defaultModel,
  temperature: defaultTemperature,
  topP: defaultTopP,
  topK: defaultTopK,
  setConfig: () => {},
  input: "",
  files: [],
  setInput: () => {},
  setFiles: () => {},
  handleInputChange: () => {},
  handleFileChange: () => {},
  handleSubmit: async () => {},
  id: "",
  messages: [],
  setMessages: () => {},
  status: "ready",
  stop: async () => {},
  error: undefined,
  tools: [],
  sendEnabled: false,
  sendMessage: async () => {},
  regenerate: async () => {
    return undefined;
  },
  clearError: () => {},
  reload: async () => {},
  resumeStream: async () => {},
  addToolResult: async () => {},
  toggleTool: () => {},
  hasTool: () => false,
  setTools: () => {},
  availableModels: CHAT_MODELS,
  data: undefined,
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
  preventChatPersistence?: boolean;
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
  preventChatPersistence = false,
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
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FilePart[]>([]);
  const [data, setData] = useState<DataUIPart<ChatbotDataPart> | undefined>(
    undefined
  );
  const [, setChatId] = useQueryState("chatId");
  const pathname = usePathname();
  const sendEnabled =
    !!input.trim() || (files.length > 0 && files.every((f) => !f.loading));

  const chatResult = useChat({
    messages: initialMessages,
    generateId: v4,
    experimental_throttle: 200,
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    onData: (incomingData) => {
      setData(incomingData);
      if (incomingData.type === "data-chat") {
        setChatId(incomingData.data.id);
      }
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

  const availableModels = useMemo(() => {
    return CHAT_MODELS.filter((model) => {
      const config = getChatConfigurationByModelId(model);
      const mediaTypes = [
        ...chatResult.messages.flatMap((message) =>
          message.parts
            .filter((part) => part.type === "file")
            .map((part) => part.mediaType)
        ),
        ...files.map((file) => file.mediaType),
      ];
      return (
        !selectedTools.some((tool) => config.disabledTools.includes(tool)) &&
        mediaTypes.every((type) => {
          if (type.startsWith("image/"))
            return config.supportedFiles.includes("img");
          if (type === "application/pdf")
            return config.supportedFiles.includes("pdf");
          return false;
        })
      );
    });
  }, [selectedTools, chatResult.messages, files]);

  const body = useMemo(() => {
    const chatIdUrl = pathname.split("/").pop() || "";
    return {
      chatId: chatId || (validate(chatIdUrl) ? chatIdUrl : undefined),
      projectId,
      preventChatPersistence,
      ...chatConfig,
      tools: selectedTools,
    };
  }, [
    chatConfig,
    chatId,
    projectId,
    preventChatPersistence,
    pathname,
    selectedTools,
  ]);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(event.target.value);
    },
    []
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFileUpload(
        setFiles,
        e.target.files,
        getChatConfigurationByModelId(selectedModel).supportedFiles
      );
    },
    [selectedModel]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (sendEnabled) {
        setInput("");
        setFiles([]);
        await chatResult.sendMessage(
          {
            role: "user",
            parts: [
              { type: "text", text: input },
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ...files.map(({ loading, ...file }) => file),
            ],
          },
          {
            body,
          }
        );
      }
    },
    [input, chatResult, body, files, sendEnabled]
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

  const reload = useCallback(
    (reloadConfig: Partial<ChatConfig> = {}) => {
      setInput("");
      chatResult.regenerate({
        messageId: chatResult.messages.at(-1)?.id,
        body: {
          ...body,
          ...reloadConfig,
        },
      });
      if (reloadConfig) {
        setConfig(reloadConfig);
      }
    },
    [body, chatResult, setConfig]
  );

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
        setFiles,
        files,
        data,
        handleInputChange,
        handleFileChange,
        handleSubmit,
        reload,
        title,
        sendEnabled,
        availableModels,
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

  const pathname = usePathname();

  useEffect(() => {
    setShowSidebar(false);
  }, [pathname]);

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
