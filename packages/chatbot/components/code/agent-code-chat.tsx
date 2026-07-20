"use client";

import { useCallback, useState } from "react";
import { ArrowUp, Mic, Square, Undo, WandSparkles } from "lucide-react";
import { AgentConversation } from "./agent-conversation";
import { useFileBrowser } from "./file-browser/file-browser-provider";
import { PendingCommentsBar } from "./file-browser/pending-comments-bar";
import { serializeComments } from "./file-browser/serialize-comments";
import { Textarea } from "@/components/chat/textarea";
import { ChatControl } from "@/components/chat/control";
import { useCodingAgent } from "@/lib/features/code/hooks/use-coding-agent";
import { usePromptRefiner } from "@/lib/features/meta-prompt/hooks/use-prompt-refiner";
import { useSpeechToText } from "@/lib/features/speech-to-text/hooks/use-speech-to-text";

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

  // Append each dictated segment to whatever is already in the textarea so the
  // transcript streams in while the user speaks.
  const appendTranscript = useCallback((text: string) => {
    setInput((prev) => (prev ? `${prev.replace(/\s+$/, "")} ${text}` : text));
  }, []);
  const {
    isRecording,
    isTranscribing,
    isSupported: isSpeechSupported,
    toggle: toggleRecording,
  } = useSpeechToText({ onTranscript: appendTranscript });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = serializeComments(input, pendingComments);
    if (!message) return;
    setInput("");
    fileBrowserActions.clearComments();
    await sendMessage(message);
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
      {error && (
        <div role="alert" className="text-xs text-red-600 px-4 py-1">
          {error}
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
          />
          <div className="absolute right-3 bottom-2 flex items-center space-x-2">
            {isSpeechSupported && (
              <ChatControl
                Icon={isRecording ? Square : Mic}
                onClick={toggleRecording}
                isActive={isRecording}
                // Show the spinner only once recording has stopped and the
                // final segment is still being transcribed.
                isLoading={isTranscribing && !isRecording}
                aria-label={
                  isRecording ? "Stop recording" : "Record voice message"
                }
              />
            )}
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
                (!input.trim() && pendingComments.length === 0) || inputIsLoading
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
