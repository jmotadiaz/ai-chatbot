"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { v4 } from "uuid";
import type { ChatHub, HubInstance, SubmitHandler, SubmitMessage } from "../types";
import { CHAT_MODELS } from "@/lib/features/foundation-model/config";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { getChatConfigurationByModelId } from "@/lib/features/foundation-model/helpers";
import type { ModelConfiguration } from "@/lib/features/foundation-model/types";
import type { FilePart } from "@/lib/features/attachment/types";
import { handleFileUpload } from "@/lib/features/attachment/utils";
import type { ChatbotMessage, Tools, Tool } from "@/lib/features/chat/types";
import {
  useChatInputState,
} from "@/lib/features/chat/hooks/use-chat-input-state";
import { useChatSendEnabled } from "@/lib/features/chat/hooks/use-chat-send-enabled";
import { useChatTools } from "@/lib/features/chat/hooks/use-chat-tools";
import { persistHubChatFromTranscript } from "@/lib/features/chat/hub/actions";

// Important: keep the runtime exclusion of "Router", but widen the type so
// downstream code can still accept `chatModelId` without TS `includes(...)` issues.
const HUB_MODELS: chatModelId[] = CHAT_MODELS.filter(
  (m) => m !== "Router"
) as chatModelId[];

const getMediaTypesFromFiles = (files: FilePart[]): string[] => {
  return files.map((f) => f.mediaType);
};

const isModelCompatibleWithMediaTypes = (
  model: chatModelId,
  mediaTypes: string[],
  tools: Tools
): boolean => {
  const config = getChatConfigurationByModelId(model);
  if (tools.length > 0 && !config.toolCalling) return false;

  return mediaTypes.every((type) => {
    if (type.startsWith("image/")) return config.supportedFiles.includes("img");
    if (type === "application/pdf") return config.supportedFiles.includes("pdf");
    return true;
  });
};

const unionSupportedFiles = (
  models: chatModelId[]
): Required<ModelConfiguration>["supportedFiles"] => {
  const set = new Set<Required<ModelConfiguration>["supportedFiles"][number]>();
  for (const model of models) {
    for (const f of getChatConfigurationByModelId(model).supportedFiles) set.add(f);
  }
  return Array.from(set);
};

const intersectSupportedFiles = (
  models: chatModelId[]
): Required<ModelConfiguration>["supportedFiles"] => {
  if (models.length === 0) return [];
  const [first, ...rest] = models;
  const base = new Set(getChatConfigurationByModelId(first).supportedFiles);
  for (const model of rest) {
    const current = new Set(getChatConfigurationByModelId(model).supportedFiles);
    for (const value of Array.from(base)) {
      if (!current.has(value)) base.delete(value);
    }
  }
  return Array.from(base);
};

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
  const [persistingInstanceId, setPersistingInstanceId] = useState<string | null>(
    null
  );

  const { input, setInput, handleInputChange } = useChatInputState("");
  const [files, setFiles] = useState<FilePart[]>([]);

  const { tools, setTools, toggleTool, hasTool } = useChatTools(initialTools);

  const sendEnabled = useChatSendEnabled({ input, files });

  const mediaTypes = useMemo(() => getMediaTypesFromFiles(files), [files]);

  const availableModels = useMemo(() => {
    if (instancesLocked) return [];
    // Hard cap: no more than 4 instances.
    if (instances.length >= 4) return [];

    const usedModels = new Set(instances.map((i) => i.model));
    return HUB_MODELS.filter(
      (model) =>
        !usedModels.has(model) &&
        isModelCompatibleWithMediaTypes(model, mediaTypes, tools)
    );
  }, [instances, instancesLocked, mediaTypes, tools]);

  const submitHandlersRef = useRef<Set<SubmitHandler>>(new Set());

  const submitSubscribe = useCallback<ChatHub["submitSubscribe"]>((handler) => {
    submitHandlersRef.current.add(handler);
    return () => {
      submitHandlersRef.current.delete(handler);
    };
  }, []);

  const removeInstance = useCallback((id: string) => {
    setInstances((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const addInstance = useCallback(
    (model: chatModelId) => {
      if (model === "Router") return;
      if (isPersisting) return;
      if (instancesLocked) return;
      if (instances.length >= 4) return;
      // Prevent adding incompatible models based on current tools + files.
      if (!availableModels.includes(model)) return;

      setInstances((prev) => [...prev, { id: v4(), model }]);
    },
    [availableModels, instances.length, instancesLocked, isPersisting]
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const instanceModels = instances.map((i) => i.model);

      // If there are active instances, enforce intersection across them.
      // If there are no instances yet, allow any file supported by at least one
      // model compatible with current tools selection.
      const supportedFiles: Required<ModelConfiguration>["supportedFiles"] =
        instanceModels.length > 0
          ? intersectSupportedFiles(instanceModels)
          : unionSupportedFiles(
              HUB_MODELS.filter((m) => {
                const config = getChatConfigurationByModelId(m);
                return tools.length === 0 || config.toolCalling;
              })
            );

      await handleFileUpload(setFiles, event.target.files, supportedFiles);
    },
    [instances, tools]
  );

  const safeToggleTool = useCallback(
    (tool: Tool) => {
      // Prevent enabling tools if any current instance doesn't support tool-calling.
      const anyIncompatible =
        instances.length > 0 &&
        instances.some((i) => !getChatConfigurationByModelId(i.model).toolCalling);

      if (anyIncompatible) return;
      toggleTool(tool);
    },
    [instances, toggleTool]
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
    async ({ instanceId, messages, model, tools = [], ...rest }) => {
      if (isPersisting) {
        throw new Error("Already persisting a chat");
      }
      setIsPersisting(true);
      setPersistingInstanceId(instanceId);
      try {
        // Server action proxy (hub orchestrates UI state; instance controls navigation).
        return await persistHubChatFromTranscript({
          messages: messages as ChatbotMessage[],
          model,
          tools,
          ...rest,
        });
      } finally {
        setIsPersisting(false);
        setPersistingInstanceId(null);
      }
    },
    [isPersisting]
  );

  return {
    instances,
    availableModels,
    instancesLocked,
    isPersisting,
    persistingInstanceId,
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


