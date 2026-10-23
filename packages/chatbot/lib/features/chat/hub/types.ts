"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type {
  ChatModelConfiguration,
  chatModelId,
} from "@/lib/features/foundation-model/config";
import type { ChatbotMessage, ChatMode } from "@/lib/features/chat/types";
import type { FilePart } from "@/lib/features/attachment/types";
import type { ChatConfig } from "@/lib/features/chat/conversation/hooks/hook-types";

export type SubmitMessage = Parameters<
  UseChatHelpers<ChatbotMessage>["sendMessage"]
>[0];

export type SubmitHandler = (message: SubmitMessage) => void | Promise<void>;

export interface HubInstance {
  chatId: string;
  model: chatModelId;
  chatMode: ChatMode;
  configuration?: Partial<ChatConfig>;
}

export interface ChatHub {
  instances: HubInstance[];
  availableModels: chatModelId[];
  supportedFilesForPicker: ChatModelConfiguration["supportedFiles"];
  /** Once the hub has sent the first message, new instances cannot be added. */
  instancesLocked: boolean;
  /** True while all instances are processing a submitted message. */
  isSubmitting: boolean;
  /** True while persisting a selected instance into a concrete chat. */
  isPersisting: boolean;
  /** Which chatId is currently being persisted (for per-panel loading UI). */
  persistingChatId: string | null;

  addInstance: (model: chatModelId, chatMode?: ChatMode) => void;
  removeInstance: (chatId: string) => Promise<void>;
  updateInstanceChatMode: (chatId: string, chatMode: ChatMode) => void;
  updateInstanceConfig: (
    chatId: string,
    configuration: Partial<ChatConfig>,
  ) => void;
  persistChat: (args: {
    chatId: string;
    messages: ChatbotMessage[];
    model: chatModelId;
    chatMode?: ChatMode;
    projectId?: string;
    temperature?: number;
    topP?: number;
    topK?: number;
    webSearchNumResults?: number;
    ragMaxResources?: number;
    minRagResourcesScore?: number;
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

  /* Checks whether a chat has already been persisted in this session */
  isChatPersisted: (chatId: string) => boolean;

  /** Lets instances register their submit callback */
  submitSubscribe: (handler: SubmitHandler) => () => void;
  /** Single form submit: builds the message once and dispatches it to every subscriber */
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}

export interface UseChatHubInstanceArgs {
  chatId: string;
  model: chatModelId;
  submitSubscribe: ChatHub["submitSubscribe"];
  chatMode?: ChatMode;
}
