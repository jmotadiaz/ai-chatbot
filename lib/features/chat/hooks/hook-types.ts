"use client";

import type { chatModelId } from "@/lib/features/foundation-model/config";
import type { Tools, Tool } from "@/lib/features/chat/types";
import type { FilePart } from "@/lib/features/attachment/types";

export interface ChatConfig {
  selectedModel: chatModelId;
  temperature: number;
  // Tool-specific configuration (only used if tool active)
  ragMaxResources: number; // max number of RAG chunks/resources returned
  webSearchNumResults: number; // number of web search results
}

export interface SetChatConfig {
  (config: Partial<ChatConfig>): void;
}

export interface ChatTools {
  tools: Tools;
  setTools: React.Dispatch<React.SetStateAction<Tools>>;
  toggleTool: (tool: Tool) => void;
  hasTool: (tool: Tool) => boolean;
}

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
