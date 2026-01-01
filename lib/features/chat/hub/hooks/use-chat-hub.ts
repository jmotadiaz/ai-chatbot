"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { v4 } from "uuid";
import type { ChatHub, HubInstance, SubmitHandler, SubmitMessage } from "../types";
import { CHAT_MODELS } from "@/lib/features/foundation-model/config";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import type { FilePart } from "@/lib/features/attachment/types";
import { handleFileUpload } from "@/lib/features/attachment/utils";
import type { ChatbotMessage, Tools, Tool } from "@/lib/features/chat/types";
import {
  useChatInputState,
} from "@/lib/features/chat/hooks/use-chat-input-state";
import { useChatSendEnabled } from "@/lib/features/chat/hooks/use-chat-send-enabled";
import { useChatTools } from "@/lib/features/chat/hooks/use-chat-tools";
import { useAvailableModels } from "@/lib/features/chat/hooks/use-available-models";
import { useSupportedFiles } from "@/lib/features/chat/hooks/use-supported-files";
import { useToolsEnabled } from "@/lib/features/chat/hooks/use-tools-enabled";
import { persistHubChatFromTranscript } from "@/lib/features/chat/hub/actions";

// Important: keep the runtime exclusion of "Router", but widen the type so
// downstream code can still accept `chatModelId` without TS `includes(...)` issues.
const HUB_MODELS: chatModelId[] = CHAT_MODELS.filter(
  (m) => m !== "Router"
) as chatModelId[];

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
  initialTools?: Tools;
}

export const useChatHub = ({
  initialInstances = [],
  initialTools = [],
}: UseChatHubArgs = {}): ChatHub => {
  const [instances, setInstances] = useState<HubInstance[]>(initialInstances);
  const [instancesLocked, setInstancesLocked] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistingChatId, setPersistingChatId] = useState<string | null>(
    null
  );

  const { input, setInput, handleInputChange } = useChatInputState("");
  const [files, setFiles] = useState<FilePart[]>([]);

  const { tools, setTools, toggleTool, hasTool } = useChatTools(initialTools);

  const sendEnabled = useChatSendEnabled({ input, files });

  const instanceModels = useMemo(() => instances.map((i) => i.model), [instances]);

  const baseAvailableModels = useAvailableModels({
    models: HUB_MODELS,
    messages: [],
    tools,
    files,
  });

  const availableModels = useMemo(() => {
    if (instancesLocked) return [];
    // Hard cap: no more than 3 instances.
    if (instances.length >= HUB_MAX_INSTANCES) return [];

    const usedModels = new Set(instances.map((i) => i.model));
    return baseAvailableModels.filter((m) => !usedModels.has(m));
  }, [baseAvailableModels, instances, instancesLocked]);

  const supportedFilesForPicker = useSupportedFiles({
    selectedModels: instanceModels,
    availableModels,
  });

  const toolsEnabled = useToolsEnabled(instanceModels);

  const submitHandlersRef = useRef<Set<SubmitHandler>>(new Set());

  const submitSubscribe = useCallback<ChatHub["submitSubscribe"]>((handler) => {
    submitHandlersRef.current.add(handler);
    return () => {
      submitHandlersRef.current.delete(handler);
    };
  }, []);

  const removeInstance = useCallback((chatId: string) => {
    setInstances((prev) => prev.filter((i) => i.chatId !== chatId));
  }, []);

  const addInstance = useCallback(
    (model: chatModelId) => {
      if (model === "Router") return;
      if (isPersisting) return;
      if (instancesLocked) return;
      if (instances.length >= HUB_MAX_INSTANCES) return;
      // Prevent adding incompatible models based on current tools + files.
      if (!availableModels.includes(model)) return;

      setInstances((prev) => [...prev, { chatId: v4(), model }]);
    },
    [availableModels, instances.length, instancesLocked, isPersisting]
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      await handleFileUpload(setFiles, event.target.files, supportedFilesForPicker);
    },
    [supportedFilesForPicker]
  );

  const safeToggleTool = useCallback(
    (tool: Tool) => {
      // Prevent enabling tools if any current instance doesn't support tool-calling.
      if (!toolsEnabled) return;
      toggleTool(tool);
    },
    [toggleTool, toolsEnabled]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!sendEnabled) return;

      // After the first send, do not allow adding new instances (comparison set is locked).
      setInstancesLocked(true);

      // Consistency with current chat: clear immediately.
      setInput("");
      setFiles([]);

      const message = buildHubUserMessage({ input, files });

      for (const handler of submitHandlersRef.current) {
        void handler(message);
      }
    },
    [files, input, sendEnabled, setInput]
  );

  const persistChat = useCallback<ChatHub["persistChat"]>(
    async ({ chatId, messages, model, tools = [], ...rest }) => {
      if (isPersisting) {
        throw new Error("Already persisting a chat");
      }
      setIsPersisting(true);
      setPersistingChatId(chatId);
      try {
        // Server action proxy (hub orchestrates UI state; instance controls navigation).
        return await persistHubChatFromTranscript({
          chatId,
          messages: messages as ChatbotMessage[],
          model,
          tools,
          ...rest,
        });
      } finally {
        setIsPersisting(false);
        setPersistingChatId(null);
      }
    },
    [isPersisting]
  );

  return {
    instances,
    availableModels,
    supportedFilesForPicker,
    toolsEnabled,
    instancesLocked,
    isPersisting,
    persistingChatId,
    addInstance,
    removeInstance,
    persistChat,

    input,
    setInput,
    handleInputChange,

    files,
    setFiles,
    handleFileChange,

    tools,
    setTools,
    toggleTool: safeToggleTool,
    hasTool,

    sendEnabled,

    submitSubscribe,
    handleSubmit,
  };
};


