"use client";

import { useEffect, useState } from "react";
import { ArrowUp, Pencil, Undo, WandSparkles, X } from "lucide-react";
import type { ModelThinking } from "./agent-code-chat-layout";
import { AgentConversation } from "./agent-conversation";
import { SkillChip } from "./skill-chip";
import { SkillsControl } from "./skills-control";
import { ReasoningControl } from "./reasoning-control";
import { useFileBrowser } from "./file-browser/file-browser-provider";
import { PendingCommentsBar } from "./file-browser/pending-comments-bar";
import { serializeComments } from "./file-browser/serialize-comments";
import { PromptFormModal } from "./prompt-form-modal";
import { Textarea } from "@/components/chat/textarea";
import { ChatControl } from "@/components/chat/control";
import { AttachmentsControl } from "@/components/chat/attachments/control";
import { useCodingAgent } from "@/lib/features/code/hooks/use-coding-agent";
import type { CodingAgentBootstrap } from "@/lib/features/code/types";
import { useCodingAgentSkills } from "@/lib/features/code/hooks/use-coding-agent-skills";
import { useCodingAgentSessionThinkingLevel } from "@/lib/features/code/hooks/use-coding-agent-session-thinking-level";
import { useCodingAgentPrompts } from "@/lib/features/code/hooks/use-coding-agent-prompts";
import type { PromptSummary } from "@/lib/features/code/worker-client";
import { usePromptRefiner } from "@/lib/features/meta-prompt/hooks/use-prompt-refiner";
import { prependSkillCommands } from "@/lib/features/code/skill-commands";
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
  modelThinking: ReadonlyMap<string, ModelThinking>;
  /** What the server render resolved; each null field falls back to CSR. */
  bootstrap?: CodingAgentBootstrap;
  /**
   * Ticket 03: the model picker lives in the layout header, outside this
   * component, so the running state travels up for its mid-turn lock.
   */
  onTurnRunningChange?: (running: boolean) => void;
}

export const AgentCodeChat: React.FC<AgentCodeChatProps> = ({
  project,
  sessionId,
  modelId,
  modelThinking,
  bootstrap,
  onTurnRunningChange,
}) => {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FilePart[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const thinking = modelThinking.get(modelId);
  const { level: thinkingLevel, setLevel: setThinkingLevel } =
    useCodingAgentSessionThinkingLevel({
      sessionId,
      modelId: modelId || null,
      defaultLevel: thinking?.defaultLevel,
      initialThinking: bootstrap?.thinking,
    });

  const {
    items,
    turnFiles,
    isRunning,
    isLoading,
    sendMessage,
    pendingFollowUp,
    enqueueFollowUp,
    clearQueue,
    promoteToSteering,
    status,
    error,
    cancel,
  } = useCodingAgent({
    project,
    sessionId,
    modelId,
    thinkingLevel,
    initialSnapshot: bootstrap?.snapshot,
  });

  // Ticket 03 guards. `hasPending` (chip armed) locks the whole composer
  // down to chip-plus-cancel; `isRunning` (active turn) locks the
  // turn-scoped config and non-text sources, which only apply next turn.
  // The undefined check keeps older hook mocks (without the ticket-01
  // field) on the unlocked path instead of a phantom lock.
  const hasPending = pendingFollowUp !== null && pendingFollowUp !== undefined;

  const handleCancel = async () => {
    const draft = await cancel().catch(() => null);
    // Abort drains the queue worker-side; the text survives as an editable
    // draft, never auto-reenqueued and never executed.
    if (draft) setInput(draft);
  };

  useEffect(() => {
    onTurnRunningChange?.(isRunning);
  }, [isRunning, onTurnRunningChange]);

  const { state: fileBrowserState, actions: fileBrowserActions } =
    useFileBrowser();
  const pendingComments = fileBrowserState.pendingComments;
  const {
    skills,
    isLoading: isLoadingSkills,
    error: skillsError,
  } = useCodingAgentSkills(sessionId, !isLoading, bootstrap?.skills);

  const [promptModal, setPromptModal] = useState<PromptSummary | null>(null);
  // Apertura del dropdown de skills/prompts, gobernada por el parent para
  // que el flujo del modal pueda cerrarlo al insertar el texto (no al
  // cancelar).
  const [promptDropdownOpen, setPromptDropdownOpen] = useState(false);

  const {
    prompts,
    sessions,
    isLoading: isLoadingPrompts,
    error: promptsError,
  } = useCodingAgentPrompts(
    sessionId,
    !isLoading,
    bootstrap?.prompts && bootstrap.promptSessions
      ? { prompts: bootstrap.prompts, sessions: bootstrap.promptSessions }
      : null,
  );

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

  const handlePromptSelect = (promptName: string) => {
    const prompt = prompts.find((p) => p.name === promptName);
    if (prompt) setPromptModal(prompt);
  };

  const handlePromptInsert = (text: string) => {
    setInput((prev) => (prev ? `${prev}\n\n${text}` : text));
    setPromptModal(null);
    // Insertar reemplaza el selector: el dropdown se cierra. Al cancelar el
    // modal permanece abierto para poder elegir otro prompt.
    setPromptDropdownOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = prependSkillCommands(
      serializeComments(input, pendingComments),
      selectedSkills,
    );
    if (!message && files.length === 0) return;
    if (totalAttachmentBytes(files) > MAX_TOTAL_ATTACHMENT_BYTES) {
      setAttachmentError(
        `Attachments are too large (max ${Math.round(MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024))}MB total)`,
      );
      return;
    }
    setAttachmentError(null);
    if (isRunning) {
      // Mid-turn sends never open a run: the hook routes plain text through
      // followUp and reports whether the worker accepted it. Only clear the
      // composer on acceptance — a worker blip keeps the draft (ticket 04:
      // error in the banner, text preserved) instead of losing it. The
      // follow-up button (handleFollowUp) already works this way.
      const accepted = await sendMessage(buildUserContent(message, files));
      if (accepted !== false) {
        setInput("");
        setFiles([]);
        setSelectedSkills([]);
        fileBrowserActions.clearComments();
      }
      return;
    }
    setInput("");
    setFiles([]);
    setSelectedSkills([]);
    fileBrowserActions.clearComments();
    await sendMessage(buildUserContent(message, files));
  };

  const handleFollowUp = async () => {
    const text = input.trim();
    if (!text || !isRunning) return;
    try {
      await enqueueFollowUp(text);
      // Only clear on success: a network blip keeps the text as a draft
      // and the hook surfaces the error in the banner above.
      setInput("");
    } catch {
      // Error already stored in hook state; preserve the draft.
    }
  };

  const handleEditPending = async () => {
    const text = pendingFollowUp;
    if (!text) return;
    try {
      await clearQueue();
      // Back to the textarea as a draft, never auto-reenqueued: the user
      // confirms with one more explicit send.
      setInput(text);
    } catch {
      // Error already stored in hook state; the chip stays armed.
    }
  };

  const handleDiscardPending = async () => {
    try {
      await clearQueue();
    } catch {
      // Error already stored in hook state; the chip stays armed.
    }
  };

  const handlePromotePending = async () => {
    const text = pendingFollowUp;
    if (!text) return;
    try {
      await promoteToSteering(text);
    } catch {
      // Error already stored in hook state; the chip stays armed.
    }
  };

  // No model yet means the session's model is still being fetched from the
  // worker (picker shows a skeleton): sending must wait for it too.
  const inputIsLoading = isRunning || isLoading || !modelId;
  const toggleSkill = (name: string) => {
    setSelectedSkills((current) =>
      current.includes(name)
        ? current.filter((skill) => skill !== name)
        : [...current, name],
    );
  };

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
        <PendingCommentsBar disabled={isRunning} />
        {pendingFollowUp && (
          <div className="mb-2 flex items-center gap-2" data-testid="followup-chip">
            {/* Ticket 02 owns the chip actions (edit/discard/promote) rendered
                here; the guards below keep the chip itself mounted and alive. */}
            <span
              aria-label="Pending follow-up"
              title={pendingFollowUp}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"
            >
              <span className="truncate">{pendingFollowUp}</span>
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="Edit pending follow-up"
                title="Edit (back to textarea)"
                onClick={() => void handleEditPending()}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Discard pending follow-up"
                title="Discard (never executes)"
                onClick={() => void handleDiscardPending()}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Promote to steering"
                title="Send now as steering (next request)"
                onClick={() => void handlePromotePending()}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
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
            disabled={hasPending}
            leadingContent={
              selectedSkills.length > 0 ? (
                <div
                  className="flex flex-wrap gap-2 px-4 pt-3"
                  aria-label="Selected skills"
                >
                  {selectedSkills.map((skill) => (
                    <SkillChip
                      key={skill}
                      name={skill}
                      onRemove={isRunning ? undefined : () => toggleSkill(skill)}
                    />
                  ))}
                </div>
              ) : undefined
            }
          />
          <div className="absolute left-3 bottom-2 flex items-center space-x-2">
            <ReasoningControl
              level={thinkingLevel}
              levels={thinking?.levels ?? []}
              onSelect={setThinkingLevel}
              disabled={isRunning}
            />
            <AttachmentsControl
              handleFileChange={handleFileChange}
              supportedFiles={CODE_AGENT_SUPPORTED_FILES}
              disabled={isRunning}
            />
            <SkillsControl
              skills={skills}
              selectedSkills={selectedSkills}
              onToggle={toggleSkill}
              isLoading={isLoadingSkills}
              error={skillsError}
              prompts={prompts}
              isLoadingPrompts={isLoadingPrompts}
              promptsError={promptsError}
              onPromptSelect={handlePromptSelect}
              open={promptDropdownOpen}
              onOpenChange={setPromptDropdownOpen}
              disabled={isRunning}
            />
          </div>
          <div className="absolute right-3 bottom-2 flex items-center space-x-2">
            {hasPreviousMessage && (
              <ChatControl
                Icon={Undo}
                onClick={undo}
                aria-label="Undo refined prompt"
                disabled={hasPending}
              />
            )}
            <ChatControl
              Icon={WandSparkles}
              onClick={refinePrompt}
              disabled={!input.length || hasPending}
              isLoading={isLoadingRefinedPrompt}
              aria-label="Refine prompt"
            />
            {isRunning && (
              <ChatControl
                Icon={ArrowUp}
                onClick={handleFollowUp}
                aria-label="Queue follow-up"
                disabled={!input.trim() || hasPending}
              />
            )}
            <ChatControl
              Icon={ArrowUp}
              type="submit"
              aria-label="Send message"
              disabled={
                (!input.trim() &&
                  pendingComments.length === 0 &&
                  files.length === 0 &&
                  selectedSkills.length === 0) ||
                inputIsLoading ||
                hasPending
              }
              isLoading={inputIsLoading}
              // Only a running turn can be cancelled; while the session or
              // model is still loading the spinner stays inert. With a chip
              // pending the spinner is the surviving cancel: ChatControl
              // ignores `disabled` in loading mode, so abort stays alive
              // while the rest of the composer locks. Abort drains the
              // queue worker-side and the text returns as a draft.
              onLoadingClick={isRunning ? () => void handleCancel() : undefined}
            />
          </div>
        </div>
      </form>
      {promptModal && (
        <PromptFormModal
          prompt={promptModal}
          sessionId={sessionId}
          sessions={sessions}
          open={!!promptModal}
          onClose={() => setPromptModal(null)}
          onInsert={handlePromptInsert}
        />
      )}
    </div>
  );
};
