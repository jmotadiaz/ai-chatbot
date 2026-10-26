"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { DataUIPart } from "ai";
import { useRef, useState } from "react";
import {
  type ChatConfig,
  type ChatModeState,
  type InputState,
  type SetChatConfig,
} from "./hook-types";
import { useAvailableModels } from "./use-available-models";
import { useChatConfig } from "./use-chat-config";
import { useChatMode } from "./use-chat-mode";
import { useHandleFileChange } from "./use-handle-file-change";
import { useChatInputState } from "./use-chat-input-state";
import { useChatSendEnabled } from "./use-chat-send-enabled";
import { useChatSubmit } from "./use-chat-submit";
import { useChatDataPartState } from "./use-chat-data-part-state";
import { useChatQueryParamId } from "./use-chat-query-param-id";
import { useChatReload } from "./use-chat-reload";
import { useChatRequestBody } from "./use-chat-request-body";
import { useChatResume, type UseChatResumeResult } from "./use-chat-resume";
import { useChatSession } from "./use-chat-session";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import {
  chatModelKeys,
  defaultModel,
  defaultWebSearchNumResults,
} from "@/lib/features/foundation-model/config";
import { useModelCatalog } from "@/lib/features/foundation-model/model-catalog-context";
import type {
  ChatbotDataPart,
  ChatbotMessage,
  ChatMode,
} from "@/lib/features/chat/types";
import { useSupportedFiles } from "@/lib/features/chat/conversation/hooks/use-supported-files";
import { FilePart } from "@/lib/features/attachment/types";
import type { RefinePromptMode } from "@/lib/features/meta-prompt/types";

export interface UseChatArgs {
  initialMessages?: ChatbotMessage[];
  projectId?: string;
  chatId?: string;
  isNewChat?: boolean;
  selectedModel?: chatModelId;
  temperature?: number;
  topP?: number;
  topK?: number;
  systemPrompt?: string;
  refinePromptMode?: RefinePromptMode;
  title?: string;
  chatMode?: ChatMode;
  preventChatPersistence?: boolean;

  webSearchNumResults?: number;
  ragMaxResources?: number;
  minRagResourcesScore?: number;
}

export interface UseChatResult
  extends UseChatHelpers<ChatbotMessage>, ChatConfig, ChatModeState, InputState {
  selectedModel: chatModelId;
  refinePromptMode?: RefinePromptMode;
  chatId?: string;
  title?: string;
  projectId?: string;
  reload: (reloadConfig?: Partial<ChatConfig> & { chatMode?: ChatMode }) => void;
  sendEnabled: boolean;
  dataPart: DataUIPart<ChatbotDataPart> | undefined;
  setConfig: SetChatConfig;
  availableModels: chatModelId[];
  isNewChat: boolean;
  preventChatPersistence: boolean;
}

export const useChat = ({
  initialMessages,
  selectedModel,
  temperature,
  topP,
  topK,
  systemPrompt,
  refinePromptMode,
  chatId,
  isNewChat = false,
  projectId,
  title,
  preventChatPersistence = false,
  chatMode: initialChatMode = "auto",

  webSearchNumResults = defaultWebSearchNumResults,
  ragMaxResources,
  minRagResourcesScore,
}: UseChatArgs): UseChatResult => {
  const catalog = useModelCatalog();
  const effectiveSelectedModel = selectedModel ?? defaultModel(catalog);
  const { chatConfig, setConfig } = useChatConfig({
    selectedModel: effectiveSelectedModel,
    temperature,
    topP,
    topK,

    webSearchNumResults,
    ragMaxResources,
    minRagResourcesScore,
  });
  const { chatMode, setChatMode } = useChatMode(initialChatMode);
  const { setQueryParamChatId, validQueryParamChatId } = useChatQueryParamId();
  const { dataPart, setDataPart } = useChatDataPartState();
  const effectiveChatId = chatId || validQueryParamChatId;

  // Resume is only for persisted chats (spec decision 6): the hub calls
  // `useChatSession` directly, and temporary/project-form chats pass
  // `preventChatPersistence`.
  const resumeEnabled = !preventChatPersistence && Boolean(effectiveChatId);

  // `useChatSession` runs BEFORE `useChatResume` because the resume hook
  // needs the live `status` value (its intent consumer watches it settle out
  // of the in-flight states). The stable callbacks the session needs
  // (`getStreamKey`, `noteStreamFinished`) reach it through a holder ref
  // populated right after the resume hook returns — both are only invoked
  // once a stream is live, long after this render, never at mount.
  const resumeApiRef = useRef<UseChatResumeResult | null>(null);

  const chatResult = useChatSession({
    initialMessages,
    api: "/api/chat",
    throttleMs: 200,
    onDataPart: setDataPart,
    id: resumeEnabled ? effectiveChatId : undefined,
    resume: resumeEnabled,
    getStreamKey: () => resumeApiRef.current?.getStreamKey(),
    onFinish: async (args) => {
      resumeApiRef.current?.noteStreamFinished(args);
      if (!isNewChat) return;
      if (preventChatPersistence) return;
      if (!effectiveChatId) return;
      await setQueryParamChatId(effectiveChatId);
    },
  });

  const resume = useChatResume({
    enabled: resumeEnabled,
    status: chatResult.status,
    getStatus: () => chatResult.status,
    resumeStream: () => chatResult.resumeStream(),
  });
  resumeApiRef.current = resume;

  const body = useChatRequestBody({
    chatId,
    validQueryParamChatId,
    projectId,
    preventChatPersistence,
    chatMode,
    systemPrompt,
    chatConfig,
  });

  const { input, setInput, handleInputChange } = useChatInputState("");
  const [files, setFiles] = useState<FilePart[]>([]);
  const sendEnabled = useChatSendEnabled({ input, files });
  const { handleSubmit } = useChatSubmit({
    sendMessage: chatResult.sendMessage,
    body,
    input,
    files,
    sendEnabled,
    beginTurn: resumeEnabled ? resume.beginTurn : undefined,
    onBeforeSubmit: () => {
      setInput("");
      setFiles([]);
    },
  });

  const availableModels = useAvailableModels({
    models: chatModelKeys(catalog),
    messages: chatResult.messages,
    files,
  });

  const supportedFiles = useSupportedFiles({
    selectedModels: [effectiveSelectedModel],
    availableModels,
  });

  const { handleFileChange } = useHandleFileChange({
    setFiles,
    supportedFiles,
  });

  const { reload } = useChatReload({
    regenerate: chatResult.regenerate,
    messages: chatResult.messages,
    body,
    beginTurn: resumeEnabled ? resume.beginTurn : undefined,
    setInput,
    setConfig,
    setChatMode,
  });

  return {
    ...chatResult,
    ...chatConfig,
    projectId,
    refinePromptMode,
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
    isNewChat,
    preventChatPersistence,
    chatMode,
    setChatMode,
  };
};
