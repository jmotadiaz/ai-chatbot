"use client";

import { useMemo } from "react";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { getChatConfigurationByModelId } from "@/lib/features/foundation-model/config";
import type { FilePart } from "@/lib/features/attachment/types";
import type { ChatbotMessage } from "@/lib/features/chat/types";

export const useAvailableModels = ({
  models,
  messages,
  files,
}: {
  models: chatModelId[];
  messages: ChatbotMessage[];
  files: FilePart[];
}): chatModelId[] => {
  return useMemo(() => {
    return models.filter((model) => {
      const config = getChatConfigurationByModelId(model);
      const mediaTypes = [
        ...messages.flatMap((message) =>
          message.parts
            .filter((part) => part.type === "file")
            .map((part) => part.mediaType),
        ),
        ...files.map((file) => file.mediaType),
      ];
      return mediaTypes.every((type) => {
        if (type.startsWith("image/"))
          return config.supportedFiles.includes("img");
        if (type === "application/pdf")
          return config.supportedFiles.includes("pdf");
        return true;
      });
    });
  }, [files, messages, models]);
};
