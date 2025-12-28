"use client";

import { useCallback } from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { ChatBody } from "./hook-types";
import type { FilePart } from "@/lib/features/attachment/types";
import type { ChatbotMessage } from "@/lib/features/chat/types";

export interface UseChatSubmitArgs {
  sendMessage: UseChatHelpers<ChatbotMessage>["sendMessage"];
  body: ChatBody;
  input: string;
  files: FilePart[];
  sendEnabled: boolean;
  onBeforeSubmit?: () => void;
  onAfterSubmit?: () => void;
}

export const useChatSubmit = ({
  sendMessage: send,
  body,
  input,
  files,
  sendEnabled,
  onBeforeSubmit,
  onAfterSubmit,
}: UseChatSubmitArgs): {
  /**
   * Sends the message using the current `input` + `files` without requiring any
   * HTML form event. This is the primitive the future ChatHub will use.
   */
  sendMessage: () => Promise<void>;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
} => {
  const sendMessage = useCallback(async () => {
    if (!sendEnabled) return;

    onBeforeSubmit?.();

    // Separate text files from other files
    const textFiles = files.filter((f) => f.textContent);
    const otherFiles = files.filter((f) => !f.textContent);

    await send(
      {
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
      },
      {
        body,
      }
    );

    onAfterSubmit?.();
  }, [
    body,
    files,
    input,
    onAfterSubmit,
    onBeforeSubmit,
    send,
    sendEnabled,
  ]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await sendMessage();
    },
    [sendMessage]
  );

  return { handleSubmit, sendMessage };
};


