"use client";
import React, {
  useCallback,
  useState,
  createContext,
  useMemo,
  useContext,
} from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import { useChat } from "@ai-sdk/react";
import type { DataUIPart } from "ai";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import { usePathname } from "next/navigation";
import { v4, validate } from "uuid";
import { useQueryState } from "nuqs";
import type { chatModelId } from "@/lib/ai/models/definition";
import {
  defaultModel,
  defaultTemperature,
  CHAT_MODELS,
  defaultRagSimilarityPercentage,
  defaultRagMaxResources,
  defaultWebSearchNumResults,
} from "@/lib/ai/models/definition";
import type { ChatbotDataPart, ChatbotMessage } from "@/lib/ai/types";
import type { Tool, Tools } from "@/lib/ai/tools/types";
import { getChatConfigurationByModelId } from "@/lib/ai/models/utils";
import type { FilePart } from "@/lib/ai/utils";
import { handleFileUpload } from "@/lib/ai/utils";

export interface ChatConfig {
  selectedModel: chatModelId;
  temperature: number;
  systemPrompt?: string;
  // Tool-specific configuration (only used if tool active)
  ragSimilarityPercentage: number; // 0-100 percentage threshold
  ragMaxResources: number; // max number of RAG chunks/resources returned
  webSearchNumResults: number; // number of web search results
}

interface SetChatConfig {
  (config: Partial<ChatConfig>): void;
}

interface ChatBody extends ChatConfig {
  chatId?: string;
  projectId?: string;
  preventChatPersistence?: boolean;
  tools: Tools;
}

interface InputState {
  input: string;
  files: FilePart[];
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setFiles: React.Dispatch<React.SetStateAction<FilePart[]>>;
  handleInputChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}

interface ChatTools {
  tools: Tools;
  setTools: React.Dispatch<React.SetStateAction<Tools>>;
  toggleTool: (tool: Tool) => void;
  hasTool: (tool: Tool) => boolean;
}

interface ChatContext
  extends UseChatHelpers<ChatbotMessage>,
    ChatConfig,
    ChatTools,
    InputState {
  selectedModel: chatModelId;
  metaPrompt?: string | null;
  chatId?: string;
  title?: string;
  projectId?: string;
  reload: (reloadConfig?: Partial<ChatConfig>) => void;
  sendEnabled: boolean;
  dataPart: DataUIPart<ChatbotDataPart> | undefined;
  setConfig: SetChatConfig;
  availableModels: chatModelId[];
}

const chatContext = createContext<ChatContext>({
  selectedModel: defaultModel,
  temperature: defaultTemperature,
  ragSimilarityPercentage: defaultRagSimilarityPercentage,
  ragMaxResources: defaultRagMaxResources,
  webSearchNumResults: defaultWebSearchNumResults,
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
  dataPart: undefined,
});

export interface ChatProviderProps {
  children: React.ReactNode;
  initialMessages?: ChatbotMessage[];
  projectId?: string;
  chatId?: string;
  selectedModel?: chatModelId;
  temperature?: number;
  systemPrompt?: string;
  metaPrompt?: string | null;
  title?: string;
  tools?: Tools;
  preventChatPersistence?: boolean;
  ragSimilarityPercentage?: number;
  ragMaxResources?: number;
  webSearchNumResults?: number;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({
  children,
  initialMessages,
  selectedModel = defaultModel,
  temperature,
  systemPrompt,
  metaPrompt,
  chatId,
  projectId,
  title,
  preventChatPersistence = false,
  tools: initialTools = [],
  ragSimilarityPercentage = defaultRagSimilarityPercentage,
  ragMaxResources = defaultRagMaxResources,
  webSearchNumResults = defaultWebSearchNumResults,
}) => {
  console.log("ChatProvider rendered", initialMessages);

  const { chatConfig, setConfig } = useChatConfig({
    selectedModel,
    temperature,
    systemPrompt,
    ragSimilarityPercentage,
    ragMaxResources,
    webSearchNumResults,
  });
  const { tools, setTools, hasTool, toggleTool } = useChatTools(initialTools);
  const [dataPart, setDataPart] = useState<
    DataUIPart<ChatbotDataPart> | undefined
  >(undefined);
  const [queryParamChatId, setChatId] = useQueryState("chatId");
  const pathname = usePathname();

  const chatResult = useChat({
    messages: initialMessages,
    generateId: v4,
    experimental_throttle: 200,
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    onData: (incoming) => {
      const incomingDataPart = incoming as DataUIPart<ChatbotDataPart>;
      setDataPart(incomingDataPart);
      if (incomingDataPart.type === "data-chat") {
        setChatId(incomingDataPart.data.id);
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

  const body = useMemo(() => {
    const chatIdUrl = pathname.split("/").pop() || queryParamChatId || "";
    return {
      chatId: chatId || (validate(chatIdUrl) ? chatIdUrl : undefined),
      projectId,
      preventChatPersistence,
      ...chatConfig,
      tools,
    };
  }, [
    pathname,
    queryParamChatId,
    chatId,
    projectId,
    preventChatPersistence,
    chatConfig,
    tools,
  ]);

  const {
    input,
    setInput,
    files,
    setFiles,
    handleFileChange,
    handleInputChange,
    handleSubmit,
    sendEnabled,
  } = useChatForm({
    selectedModel: chatConfig.selectedModel,
    chatResult,
    body,
  });

  const availableModels = useAvailableModels({
    chatResult,
    tools,
    files,
  });

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
    [body, chatResult, setConfig, setInput]
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
        dataPart,
        handleInputChange,
        handleFileChange,
        handleSubmit,
        reload,
        title,
        sendEnabled,
        availableModels,
        tools,
        toggleTool,
        hasTool,
        setTools,
      }}
    >
      {children}
    </chatContext.Provider>
  );
};

const useChatConfig = ({
  selectedModel = defaultModel,
  temperature,
  systemPrompt,
  ragSimilarityPercentage,
  ragMaxResources,
  webSearchNumResults,
}: Partial<ChatConfig>): {
  chatConfig: ChatConfig;
  setConfig: SetChatConfig;
} => {
  const [chatConfig, setChatConfig] = useState<ChatConfig>(() =>
    Object.assign(
      getChatConfigurationByModelId(selectedModel),
      Object.fromEntries(
        Object.entries({
          temperature,
          systemPrompt,
          ragSimilarityPercentage,
          ragMaxResources,
          webSearchNumResults,
        }).filter(([, value]) => value !== undefined && value !== null)
      ),
      {
        selectedModel,
        useRAG: false,
        useWebSearch: false,
        ragSimilarityPercentage:
          ragSimilarityPercentage !== undefined
            ? ragSimilarityPercentage
            : defaultRagSimilarityPercentage,
        ragMaxResources:
          ragMaxResources !== undefined
            ? ragMaxResources
            : defaultRagMaxResources,
        webSearchNumResults:
          webSearchNumResults !== undefined
            ? webSearchNumResults
            : defaultWebSearchNumResults,
      }
    )
  );

  const setConfig = useCallback<SetChatConfig>((config) => {
    setChatConfig((prev) => ({
      ...prev,
      ...config,
    }));
  }, []);

  return { chatConfig, setConfig };
};

const useAvailableModels = ({
  chatResult,
  tools,
  files,
}: {
  chatResult: UseChatHelpers<ChatbotMessage>;
  tools: Tools;
  files: FilePart[];
}): chatModelId[] => {
  return useMemo(() => {
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
        (!tools.length || config.toolCalling) &&
        mediaTypes.every((type) => {
          if (type.startsWith("image/"))
            return config.supportedFiles.includes("img");
          if (type === "application/pdf")
            return config.supportedFiles.includes("pdf");
          return false;
        })
      );
    });
  }, [tools, chatResult.messages, files]);
};

const useChatForm = ({
  selectedModel,
  chatResult,
  body,
}: {
  selectedModel: chatModelId;
  chatResult: UseChatHelpers<ChatbotMessage>;
  body: ChatBody;
}): Pick<
  ChatContext,
  | "input"
  | "setInput"
  | "files"
  | "setFiles"
  | "handleFileChange"
  | "handleInputChange"
  | "handleSubmit"
  | "sendEnabled"
> => {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FilePart[]>([]);
  const sendEnabled =
    !!input.trim() || (files.length > 0 && files.every((f) => !f.loading));

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
    [sendEnabled, chatResult, input, files, body]
  );

  return {
    input,
    setInput,
    files,
    setFiles,
    handleInputChange,
    handleFileChange,
    handleSubmit,
    sendEnabled,
  };
};

const useChatTools = (initialTools: Tools = []): ChatTools => {
  const [tools, setTools] = useState<Tools>(initialTools);
  const toggleTool = useCallback((tool: Tool) => {
    setTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  }, []);

  const hasTool = useCallback(
    (tool: Tool) => {
      return tools.includes(tool);
    },
    [tools]
  );

  return { tools, toggleTool, hasTool, setTools };
};

export const useChatContext = () => useContext(chatContext);
