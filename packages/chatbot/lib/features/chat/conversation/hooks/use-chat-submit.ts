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
  /**
   * Marks the beginning of a resumable turn: generates the per-turn
   * `streamKey` (included in the POST body so the server registers it in
   * the resume registry). `undefined` when resume is disabled — the body
   * then stays exactly as before.
   */
  beginTurn?: () => string;
  /**
   * Serialises the send behind an in-flight resume probe (ticket 08):
   * awaited BEFORE `beginTurn()` and the send. A send that starts while a
   * mount probe is unresolved is the race that hid the loading state
   * mid-stream — the gate makes the send wait for the probe (and, when the
   * probe attached to a live stream, for that turn to end). `undefined`
   * when resume is disabled (nothing can be in flight).
   */
  resumeGate?: () => Promise<void>;
  onBeforeSubmit?: () => void;
  onAfterSubmit?: () => void;
}

export const useChatSubmit = ({
  sendMessage: send,
  body,
  input,
  files,
  sendEnabled,
  beginTurn,
  resumeGate,
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

    // Never send over an in-flight resume probe (ticket 08): the probe's
    // late silent `204` would settle the status to `ready` mid-send, and the
    // probe could attach to a stream registered after this POST. When the
    // probe attached to a live turn, the gate resolves when that turn ends.
    await resumeGate?.();

    onBeforeSubmit?.();

    // One resume key per send (never per chat): the POST registers the turn
    // in the resume registry under it.
    const streamKey = beginTurn?.();
    const requestBody =
      streamKey !== undefined ? { ...body, streamKey } : body;

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
        body: requestBody,
      }
    );


    onAfterSubmit?.();
  }, [
    beginTurn,
    body,
    files,
    input,
    onAfterSubmit,
    onBeforeSubmit,
    resumeGate,
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


