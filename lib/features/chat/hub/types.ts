"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import type { ChatbotMessage, Tools, Tool } from "@/lib/features/chat/types";
import type { FilePart } from "@/lib/features/attachment/types";

export type SubmitMessage = Parameters<
  UseChatHelpers<ChatbotMessage>["sendMessage"]
>[0];

export type SubmitHandler = (message: SubmitMessage) => void | Promise<void>;

export interface HubInstance {
  id: string;
  model: chatModelId;
}

export interface ChatHub {
  instances: HubInstance[];
  availableModels: chatModelId[];
  /** Once the hub has sent the first message, new instances cannot be added. */
  instancesLocked: boolean;
  /** True while persisting a selected instance into a concrete chat. */
  isPersisting: boolean;
  /** Which instance is currently being persisted (for per-panel loading UI). */
  persistingInstanceId: string | null;

  addInstance: (model: chatModelId) => void;
  removeInstance: (id: string) => void;
  persistChat: (args: {
    instanceId: string;
    messages: ChatbotMessage[];
    model: chatModelId;
    tools?: Tools;
    projectId?: string;
    temperature?: number;
    ragMaxResources?: number;
    webSearchNumResults?: number;
  }) => Promise<{ chatId: string }>;

  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  handleInputChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;

  files: FilePart[];
  setFiles: React.Dispatch<React.SetStateAction<FilePart[]>>;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;

  tools: Tools;
  setTools: React.Dispatch<React.SetStateAction<Tools>>;
  toggleTool: (tool: Tool) => void;
  hasTool: (tool: Tool) => boolean;

  sendEnabled: boolean;

  /** Permite a las instancias registrar su callback de envío */
  submitSubscribe: (handler: SubmitHandler) => () => void;
  /** Único submit del form: construye el mensaje una vez y lo dispara a todos los suscriptores */
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}

export interface UseChatHubInstanceArgs {
  id: string;
  model: chatModelId;
  submitSubscribe: ChatHub["submitSubscribe"];
}


