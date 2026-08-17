"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Undo, WandSparkles, X } from "lucide-react";
import { toast } from "sonner";
import { SkillChip } from "./skill-chip";
import { SkillsControl } from "./skills-control";
import { PromptFormModal } from "./prompt-form-modal";
import {
  ModelPickerLoading,
  ModelPickerSelector,
} from "@/components/chat/model-picker";
import { Textarea } from "@/components/chat/textarea";
import { ChatControl } from "@/components/chat/control";
import { createCodingAgentSession } from "@/lib/features/code/actions";
import { useCodingAgentSessionModel } from "@/lib/features/code/hooks/use-coding-agent-session-model";
import { useCodingAgentSkills } from "@/lib/features/code/hooks/use-coding-agent-skills";
import { useCodingAgentPrompts } from "@/lib/features/code/hooks/use-coding-agent-prompts";
import { usePromptRefiner } from "@/lib/features/meta-prompt/hooks/use-prompt-refiner";
import { prependSkillCommands } from "@/lib/features/code/skill-commands";
import type { PromptSummary } from "@/lib/features/code/worker-client";
import type { chatModelId } from "@/lib/features/foundation-model/config";

export interface MarkdownToSessionModalProps {
  onClose: () => void;
  /** File path whose Markdown content becomes the prompt body. */
  path: string;
  /** Full Markdown source, appended to the prefix. */
  content: string;
  project: string;
  sessionId: string;
}

interface WorkerModel {
  id: string;
  levels: unknown[];
}

export const MarkdownToSessionModal: React.FC<MarkdownToSessionModalProps> = ({
  onClose,
  path,
  content,
  project,
  sessionId,
}) => {
  const router = useRouter();
  const [prefix, setPrefix] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [promptModal, setPromptModal] = useState<PromptSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/agent/code/models");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { models?: WorkerModel[] };
        if (!cancelled) setAvailableModels((data.models ?? []).map((m) => m.id));
      } catch {
        // The picker degrades to the session's model or stays empty.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Default selection: the session we are browsing in; fall back to the first
  // available model once the list arrives.
  const { modelId, setModelId, isLoading: isLoadingModel } =
    useCodingAgentSessionModel({
      sessionId,
      fallbackModelId: availableModels[0] ?? "",
    });
  const effectiveModelId = modelId || availableModels[0] || ("" as chatModelId);

  const { skills, isLoading: isLoadingSkills, error: skillsError } =
    useCodingAgentSkills(sessionId, true);
  const { prompts, sessions, isLoading: isLoadingPrompts, error: promptsError } =
    useCodingAgentPrompts(sessionId, true);

  const { isLoadingRefinedPrompt, refinePrompt, undo, hasPreviousMessage } =
    usePromptRefiner({ input: prefix, setInput: setPrefix, mode: "coding-agent" });

  const canSubmit =
    !isConverting &&
    !isLoadingModel &&
    !!effectiveModelId &&
    (!!prefix.trim() || selectedSkills.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const base = prependSkillCommands(prefix.trim(), selectedSkills);
    const prompt = base ? `${base}\n\n${content}` : content;
    setIsConverting(true);
    try {
      const session = await createCodingAgentSession(project, effectiveModelId, prompt);
      router.push(`/agent/code/${encodeURIComponent(project)}/${session.sessionId}`);
    } catch {
      toast.error("Failed to create coding agent session");
      setIsConverting(false);
    }
  };

  const toggleSkill = (name: string) =>
    setSelectedSkills((current) =>
      current.includes(name)
        ? current.filter((skill) => skill !== name)
        : [...current, name],
    );

  const handlePromptSelect = (promptName: string) => {
    const prompt = prompts.find((p) => p.name === promptName);
    if (prompt) setPromptModal(prompt);
  };

  const handlePromptInsert = (text: string) => {
    setPrefix((prev) => (prev ? `${prev}\n\n${text}` : text));
    setPromptModal(null);
  };

  const filename = path.split("/").pop() ?? path;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`New session from ${filename}`}
          className="mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-zinc-900"
          onClick={(event) => event.stopPropagation()}
        >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">New session from {filename}</h2>
            <p className="truncate text-sm text-muted-foreground">
              The file&apos;s Markdown will be sent as the prompt body.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-3 px-6 pt-4">
          <span className="text-sm font-medium text-muted-foreground">Model</span>
          <div className="min-w-0 flex-1">
            {isLoadingModel ? (
              <ModelPickerLoading />
            ) : (
              <ModelPickerSelector
                id="markdown-to-session-model"
                selectedModel={effectiveModelId as chatModelId}
                setSelectedModel={setModelId as (m: chatModelId) => void}
                models={availableModels as chatModelId[]}
                dropdownVariant="responsive-bottom-right"
              />
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4">
          <div className="relative w-full">
            <Textarea
              onChangeInput={setPrefix}
              input={prefix}
              isLoading={isConverting}
              placeholder="Instructions for the session…"
              leadingContent={
                selectedSkills.length > 0 ? (
                  <div className="flex flex-wrap gap-2 px-4 pt-3" aria-label="Selected skills">
                    {selectedSkills.map((skill) => (
                      <SkillChip key={skill} name={skill} onRemove={() => toggleSkill(skill)} />
                    ))}
                  </div>
                ) : undefined
              }
            />
            <div className="absolute bottom-2 left-3 flex items-center space-x-2">
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
              />
            </div>
            <div className="absolute bottom-2 right-3 flex items-center space-x-2">
              {hasPreviousMessage && (
                <ChatControl Icon={Undo} onClick={undo} aria-label="Undo refined prompt" />
              )}
              <ChatControl
                Icon={WandSparkles}
                onClick={refinePrompt}
                disabled={!prefix.length}
                isLoading={isLoadingRefinedPrompt}
                aria-label="Refine prompt"
              />
              <ChatControl
                Icon={ArrowUp}
                type="submit"
                aria-label="Send message"
                disabled={!canSubmit}
                isLoading={isConverting}
              />
            </div>
          </div>
        </form>
        </div>
      </div>

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
    </>
  );
};
