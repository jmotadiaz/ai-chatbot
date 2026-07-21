"use client";

import { useState } from "react";
import { ArrowUp, Undo, WandSparkles } from "lucide-react";
import { AgentConversation } from "./agent-conversation";
import { useFileBrowser } from "./file-browser/file-browser-provider";
import { PendingCommentsBar } from "./file-browser/pending-comments-bar";
import { serializeComments } from "./file-browser/serialize-comments";
import { Textarea } from "@/components/chat/textarea";
import { ChatControl } from "@/components/chat/control";
import { AttachmentsControl } from "@/components/chat/attachments/control";
import { useCodingAgent } from "@/lib/features/code/hooks/use-coding-agent";
import { usePromptRefiner } from "@/lib/features/meta-prompt/hooks/use-prompt-refiner";
import { handleLocalFileUpload } from "@/lib/features/attachment/utils";
import type { FilePart } from "@/lib/features/attachment/types";
import {
  buildUserContent,
  CODE_AGENT_SUPPORTED_FILES,
  MAX_IMAGE_BYTES,
  MAX_TEXT_FILE_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  totalAttachmentBytes,
} from "@/lib/features/code/attachments";

export interface AgentCodeChatProps {
  project: string;
  sessionId: string;
  modelId: string;
}

export const AgentCodeChat: React.FC<AgentCodeChatProps> = ({
  project,
  sessionId,
  modelId,
}) => {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FilePart[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const {
    items,
    turnFiles,
    isRunning,
    isLoading,
    sendMessage,
    status,
    error,
    cancel,
  } = useCodingAgent({
    project,
    sessionId,
    modelId,
  });

  const { state: fileBrowserState, actions: fileBrowserActions } =
    useFileBrowser();
  const pendingComments = fileBrowserState.pendingComments;

  const { isLoadingRefinedPrompt, refinePrompt, undo, hasPreviousMessage } =
    usePromptRefiner({
      input,
      setInput,
      mode: "coding-agent",
      status: isRunning ? "submitted" : undefined,
    });

  const uploadOptions = {
    maxImageBytes: MAX_IMAGE_BYTES,
    maxTextFileBytes: MAX_TEXT_FILE_BYTES,
    onError: setAttachmentError,
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleLocalFileUpload(setFiles, e.target.files, uploadOptions);
    e.target.value = "";
  };

  const onPasteFiles = (fileList: FileList) => {
    void handleLocalFileUpload(setFiles, fileList, uploadOptions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = serializeComments(input, pendingComments);
    if (!message && files.length === 0) return;
    if (totalAttachmentBytes(files) > MAX_TOTAL_ATTACHMENT_BYTES) {
      setAttachmentError(
        `Attachments are too large (max ${Math.round(MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024))}MB total)`,
      );
      return;
    }
    setAttachmentError(null);
    setInput("");
    setFiles([]);
    fileBrowserActions.clearComments();
    await sendMessage(buildUserContent(message, files));
  };

  // No model yet means the session's model is still being fetched from the
  // worker (picker shows a skeleton): sending must wait for it too.
  const inputIsLoading = isRunning || isLoading || !modelId;

  return (
    <div
      data-testid="chat-container"
      className="flex flex-col relative h-full pt-16"
    >
      <AgentConversation
        items={items}
        isRunning={isRunning}
        status={status}
        turnFiles={turnFiles}
      />
      {(error || attachmentError) && (
        <div role="alert" className="text-xs text-red-600 px-4 py-1">
          {error || attachmentError}
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="bg-(--background) w-full max-w-5xl mx-auto pb-4 px-4 relative"
      >
        <PendingCommentsBar />
        <div className="relative w-full">
          <Textarea
            onChangeInput={setInput}
            input={input}
            isLoading={inputIsLoading}
            isLoadingRefinedPrompt={isLoadingRefinedPrompt}
            placeholder="Ask the coding agent..."
            onPasteFiles={onPasteFiles}
            files={files}
            setFiles={setFiles}
          />
          <div className="absolute left-3 bottom-2 flex items-center space-x-2">
            <AttachmentsControl
              handleFileChange={handleFileChange}
              supportedFiles={CODE_AGENT_SUPPORTED_FILES}
            />
          </div>
          <div className="absolute right-3 bottom-2 flex items-center space-x-2">
            {hasPreviousMessage && (
              <ChatControl
                Icon={Undo}
                onClick={undo}
                aria-label="Undo refined prompt"
              />
            )}
            <ChatControl
              Icon={WandSparkles}
              onClick={refinePrompt}
              disabled={!input.length}
              isLoading={isLoadingRefinedPrompt}
              aria-label="Refine prompt"
            />
            <ChatControl
              Icon={ArrowUp}
              type="submit"
              aria-label="Send message"
              disabled={
                (!input.trim() &&
                  pendingComments.length === 0 &&
                  files.length === 0) ||
                inputIsLoading
              }
              isLoading={inputIsLoading}
              // Only a running turn can be cancelled; while the session or
              // model is still loading the spinner stays inert.
              onLoadingClick={isRunning ? () => void cancel() : undefined}
            />
          </div>
        </div>
      </form>
    </div>
  );
};
