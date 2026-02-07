"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import type { ModelConfiguration } from "@/lib/features/foundation-model/types";
import type { ChatbotMessage, Agent } from "@/lib/features/chat/types";
import type { FilePart } from "@/lib/features/attachment/types";

export type SubmitMessage = Parameters<
  UseChatHelpers<ChatbotMessage>["sendMessage"]
>[0];

export type SubmitHandler = (message: SubmitMessage) => void | Promise<void>;

export interface HubInstance {
  chatId: string;
  model: chatModelId;
  agent: Agent;
}

export interface ChatHub {
  instances: HubInstance[];
  availableModels: chatModelId[];
  supportedFilesForPicker: Required<ModelConfiguration>["supportedFiles"];
  toolsEnabled: boolean;
  /** Once the hub has sent the first message, new instances cannot be added. */
  instancesLocked: boolean;
  /** True while all instances are processing a submitted message. */
  isSubmitting: boolean;
  /** True while persisting a selected instance into a concrete chat. */
  isPersisting: boolean;
  /** Which chatId is currently being persisted (for per-panel loading UI). */
  persistingChatId: string | null;

  addInstance: (model: chatModelId, agent?: Agent) => void;
  removeInstance: (chatId: string) => void;
  updateInstanceAgent: (chatId: string, agent: Agent) => void;
  persistChat: (args: {
    chatId: string;
    messages: ChatbotMessage[];
    model: chatModelId;
    agent?: Agent;
    projectId?: string;
    temperature?: number;

    webSearchNumResults?: number;
  }) => Promise<{ chatId: string }>;

  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  handleInputChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;

  files: FilePart[];
  setFiles: React.Dispatch<React.SetStateAction<FilePart[]>>;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;

  sendEnabled: boolean;

  /* Verifica si un chat ya ha sido persistido en esta sesión */
  isChatPersisted: (chatId: string) => boolean;

  /** Permite a las instancias registrar su callback de envío */
  submitSubscribe: (handler: SubmitHandler) => () => void;
  /** Único submit del form: construye el mensaje una vez y lo dispara a todos los suscriptores */
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}

export interface UseChatHubInstanceArgs {
  chatId: string;
  model: chatModelId;
  submitSubscribe: ChatHub["submitSubscribe"];
  agent?: Agent;
}
