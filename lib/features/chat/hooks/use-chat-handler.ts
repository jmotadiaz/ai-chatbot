"use client";

import { useCallback, useState, useMemo } from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { chatModelId } from "@/lib/features/models/constants";
import type { ChatbotMessage } from "@/lib/types";
import {
  defaultModel,
  CHAT_MODELS,
  defaultRagMaxResources,
  defaultWebSearchNumResults,
} from "@/lib/features/models/constants";
import { getChatConfigurationByModelId } from "@/lib/features/models/config";
import type { FilePart } from "@/lib/features/attachment/types";
import { handleFileUpload } from "@/lib/features/attachment/utils";
import type { Tool, Tools } from "@/lib/ai/tools/types";

// -- Config Hook --

export interface ChatConfig {
  selectedModel: chatModelId;
  temperature: number;
  systemPrompt?: string;
  // Tool-specific configuration (only used if tool active)
  ragMaxResources: number; // max number of RAG chunks/resources returned
  webSearchNumResults: number; // number of web search results
}

export interface SetChatConfig {
  (config: Partial<ChatConfig>): void;
}

export const useChatConfig = ({
  selectedModel = defaultModel,
  temperature,
  systemPrompt,
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
          ragMaxResources,
          webSearchNumResults,
        }).filter(([, value]) => value !== undefined && value !== null)
      ),
      {
        selectedModel,
        useRAG: false,
        useWebSearch: false,
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

// -- Tools Hook --

export interface ChatTools {
  tools: Tools;
  setTools: React.Dispatch<React.SetStateAction<Tools>>;
  toggleTool: (tool: Tool) => void;
  hasTool: (tool: Tool) => boolean;
}

export const useChatTools = (initialTools: Tools = []): ChatTools => {
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

// -- handler hook --

export interface ChatBody extends ChatConfig {
  chatId?: string | null;
  projectId?: string;
  preventChatPersistence?: boolean;
  tools: Tools;
}

export interface InputState {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  files: FilePart[];
  setFiles: React.Dispatch<React.SetStateAction<FilePart[]>>;
  handleInputChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  sendEnabled: boolean;
}

export const useChatHandler = ({
  selectedModel,
  chatResult,
  body,
}: {
  selectedModel: chatModelId;
  chatResult: UseChatHelpers<ChatbotMessage>;
  body: ChatBody;
}): InputState => {
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

        // Separate text files from other files
        const textFiles = files.filter((f) => f.textContent);
        const otherFiles = files.filter((f) => !f.textContent);

        await chatResult.sendMessage(
          {
            role: "user",
            parts: [
              { type: "text", text: input },
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ...otherFiles.map(({ loading, textContent, ...file }) => file),
            ],
            metadata: {
              status: "finished",
              ...(textFiles.length > 0 && {
                textFiles: textFiles.map((f) => ({
                  filename: f.filename || "",
                  content: f.textContent || "",
                  mediaType: f.mediaType || "text/plain",
                })),
              }),
            },
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

// -- Available Models Hook --

export const useAvailableModels = ({
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
          return true;
        })
      );
    });
  }, [tools, chatResult.messages, files]);
};
