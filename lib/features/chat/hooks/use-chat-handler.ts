"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { ChatBody, InputState } from "./hook-types";
import { useChatFilesState } from "./use-chat-files-state";
import { useChatInputState } from "./use-chat-input-state";
import { useChatSendEnabled } from "./use-chat-send-enabled";
import { useChatSubmit } from "./use-chat-submit";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import type { chatModelId } from "@/lib/features/foundation-model/config";

// Keep this module as a thin backwards-compatible wrapper + re-exports.
export * from "./hook-types";
export * from "./use-chat-config";
export * from "./use-chat-tools";
export * from "./use-available-models";
export * from "./use-chat-input-state";
export * from "./use-chat-files-state";
export * from "./use-chat-send-enabled";
export * from "./use-chat-submit";

export const useChatHandler = ({
  selectedModel,
  chatResult,
  body,
}: {
  selectedModel: chatModelId;
  chatResult: UseChatHelpers<ChatbotMessage>;
  body: ChatBody;
}): InputState => {
  const { input, setInput, handleInputChange } = useChatInputState("");
  const { files, setFiles, handleFileChange } = useChatFilesState({
    selectedModel,
    initialFiles: [],
  });
  const sendEnabled = useChatSendEnabled({ input, files });

  const { handleSubmit } = useChatSubmit({
    sendMessage: chatResult.sendMessage,
    body,
    input,
    files,
    sendEnabled,
    // Preserve current behavior: clear immediately on submit
    onBeforeSubmit: () => {
      setInput("");
      setFiles([]);
    },
  });

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
