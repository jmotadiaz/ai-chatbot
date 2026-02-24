"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { v4 } from "uuid";
import type {
  ChatHub,
  HubInstance,
  SubmitHandler,
  SubmitMessage,
} from "../types";
import { CHAT_MODELS } from "@/lib/features/foundation-model/config";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import type { FilePart } from "@/lib/features/attachment/types";
import { handleFileUpload } from "@/lib/features/attachment/utils";
import type { ChatbotMessage, Agent } from "@/lib/features/chat/types";
import { useChatInputState } from "@/lib/features/chat/conversation/hooks/use-chat-input-state";
import { useChatSendEnabled } from "@/lib/features/chat/conversation/hooks/use-chat-send-enabled";
import { useAvailableModels } from "@/lib/features/chat/conversation/hooks/use-available-models";
import { useSupportedFiles } from "@/lib/features/chat/conversation/hooks/use-supported-files";
import { persistHubChatFromTranscript } from "@/lib/features/chat/hub/actions";
import { deleteChat } from "@/lib/features/chat/actions";
import type { ChatConfig } from "@/lib/features/chat/conversation/hooks/hook-types";

const HUB_MODELS: chatModelId[] = CHAT_MODELS;

const HUB_MAX_INSTANCES = 3;

const buildHubUserMessage = ({
  input,
  files,
}: {
  input: string;
  files: FilePart[];
}): SubmitMessage => {
  const textFiles = files.filter((f) => f.textContent);
  const otherFiles = files.filter((f) => !f.textContent);

  return {
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
  };
};

export interface UseChatHubArgs {
  initialInstances?: HubInstance[];
}

export const useChatHub = ({
  initialInstances = [],
}: UseChatHubArgs = {}): ChatHub => {
  const [instances, setInstances] = useState<HubInstance[]>(
    initialInstances.map((i) => ({ ...i, agent: i.agent || "rag" })),
  );
  const [instancesLocked, setInstancesLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistingChatId, setPersistingChatId] = useState<string | null>(null);
  const [persistedChatIds, setPersistedChatIds] = useState<Set<string>>(
    new Set(),
  );

  const { input, setInput, handleInputChange } = useChatInputState("");
  const [files, setFiles] = useState<FilePart[]>([]);

  const sendEnabled =
    useChatSendEnabled({ input, files }) && instances.length > 0;

  const instanceModels = useMemo(
    () => instances.map((i) => i.model),
    [instances],
  );

  const baseAvailableModels = useAvailableModels({
    models: HUB_MODELS,
    messages: [],
    files,
  });

  const availableModels = useMemo(() => {
    if (instancesLocked) return [];
    // Hard cap: no more than 3 instances.
    if (instances.length >= HUB_MAX_INSTANCES) return [];

    return baseAvailableModels;
  }, [baseAvailableModels, instances.length, instancesLocked]);

  const supportedFilesForPicker = useSupportedFiles({
    selectedModels: instanceModels,
    availableModels,
  });

  const submitHandlersRef = useRef<Set<SubmitHandler>>(new Set());

  const submitSubscribe = useCallback<ChatHub["submitSubscribe"]>((handler) => {
    submitHandlersRef.current.add(handler);
    return () => {
      submitHandlersRef.current.delete(handler);
    };
  }, []);

  const removeInstance = useCallback(
    async (chatId: string) => {
      if (persistedChatIds.has(chatId)) {
        await deleteChat(chatId);
        setPersistedChatIds((prev) => {
          const next = new Set(prev);
          next.delete(chatId);
          return next;
        });
      }
      setInstances((prev) => prev.filter((i) => i.chatId !== chatId));
    },
    [persistedChatIds],
  );

  const updateInstanceAgent = useCallback((chatId: string, agent: Agent) => {
    setInstances((prev) =>
      prev.map((i) => (i.chatId === chatId ? { ...i, agent } : i)),
    );
  }, []);

  const updateInstanceConfig = useCallback(
    (chatId: string, configuration: Partial<ChatConfig>) => {
      setInstances((prev) =>
        prev.map((i) =>
          i.chatId === chatId
            ? { ...i, configuration: { ...i.configuration, ...configuration } }
            : i,
        ),
      );
    },
    [],
  );

  const addInstance = useCallback(
    (model: chatModelId, agent: Agent = "rag") => {
      if (isPersisting) return;
      if (instancesLocked) return;
      if (instances.length >= HUB_MAX_INSTANCES) return;
      // Prevent adding incompatible models based on current tools + files.
      if (!availableModels.includes(model)) return;

      setInstances((prev) => [
        ...prev,
        { chatId: v4(), model, agent, configuration: {} },
      ]);
    },
    [availableModels, instances.length, instancesLocked, isPersisting],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      await handleFileUpload(
        setFiles,
        event.target.files,
        supportedFilesForPicker,
      );
    },
    [supportedFilesForPicker],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!sendEnabled || isSubmitting) return;

      // After the first send, do not allow adding new instances (comparison set is locked).
      setInstancesLocked(true);
      setIsSubmitting(true);

      // Consistency with current chat: clear immediately.
      setInput("");
      setFiles([]);

      const message = buildHubUserMessage({ input, files });

      // Collect all handler promises and wait for all to settle
      const promises = Array.from(submitHandlersRef.current).map((handler) =>
        Promise.resolve(handler(message)),
      );

      await Promise.allSettled(promises);
      setIsSubmitting(false);
    },
    [files, input, isSubmitting, sendEnabled, setInput],
  );

  const persistChat = useCallback<ChatHub["persistChat"]>(
    async ({ chatId, messages, model, agent, ...rest }) => {
      if (isPersisting) {
        throw new Error("Already persisting a chat");
      }
      setIsPersisting(true);
      setPersistingChatId(chatId);
      try {
        // Server action proxy (hub orchestrates UI state; instance controls navigation).
        const result = await persistHubChatFromTranscript({
          chatId,
          messages: messages as ChatbotMessage[],
          model,
          agent: agent || "rag",
          ...rest,
        });

        setPersistedChatIds((prev) => {
          const next = new Set(prev);
          next.add(chatId);
          return next;
        });

        return result;
      } finally {
        setIsPersisting(false);
        setPersistingChatId(null);
      }
    },
    [isPersisting],
  );

  const isChatPersisted = useCallback(
    (chatId: string) => persistedChatIds.has(chatId),
    [persistedChatIds],
  );

  return {
    instances,
    availableModels,
    supportedFilesForPicker,
    instancesLocked,
    isSubmitting,
    isPersisting,
    persistingChatId,
    isChatPersisted,
    addInstance,
    removeInstance,
    updateInstanceAgent,
    updateInstanceConfig,
    persistChat,

    input,
    setInput,
    handleInputChange,

    files,
    setFiles,
    handleFileChange,

    sendEnabled,

    submitSubscribe,
    handleSubmit,
  };
};
