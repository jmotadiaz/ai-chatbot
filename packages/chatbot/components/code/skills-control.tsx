"use client";

import { useState } from "react";
import { Check, FolderOpen, Puzzle } from "lucide-react";
import { ChatControl } from "@/components/chat/control";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils/helpers";
import type { PromptSummary } from "@/lib/features/code/worker-client";

export interface CodingAgentSkill {
  name: string;
  description: string;
}

export interface SkillsControlProps {
  skills: CodingAgentSkill[];
  selectedSkills: string[];
  onToggle: (name: string) => void;
  isLoading?: boolean;
  error?: string | null;
  prompts?: PromptSummary[];
  isLoadingPrompts?: boolean;
  promptsError?: string | null;
  onPromptSelect?: (promptName: string) => void;
}

export const SkillsControl: React.FC<SkillsControlProps> = ({
  skills,
  selectedSkills,
  onToggle,
  isLoading = false,
  error,
  prompts = [],
  isLoadingPrompts = false,
  promptsError,
  onPromptSelect,
}) => {
  const { getDropdownPopupProps, getDropdownTriggerProps, close } = useDropdown();
  const [activeTab, setActiveTab] = useState<"skills" | "prompts">("skills");

  return (
    <Dropdown.Container data-testid="coding-agent-skills-control">
      <ChatControl
        Icon={Puzzle}
        type="button"
        aria-label="Select skills"
        title="Select skills"
        isActive={selectedSkills.length > 0}
        {...getDropdownTriggerProps()}
      />
      <Dropdown.Popup
        {...getDropdownPopupProps()}
        variant="responsive-top-right"
        className="w-full lg:w-96"
      >
        <div className="border-b border-muted">
          <div className="flex" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === "skills"}
              onClick={() => setActiveTab("skills")}
              className={cn(
                "flex-1 px-4 py-3 text-sm font-semibold text-center transition-colors border-b-2 -mb-px",
                activeTab === "skills"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-zinc-600 hover:bg-secondary-accent-foreground",
              )}
            >
              Skills
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "prompts"}
              onClick={() => setActiveTab("prompts")}
              className={cn(
                "flex-1 px-4 py-3 text-sm font-semibold text-center transition-colors border-b-2 -mb-px",
                activeTab === "prompts"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-zinc-600 hover:bg-secondary-accent-foreground",
              )}
            >
              Prompts
            </button>
          </div>
        </div>
        {activeTab === "skills" && (
          <>
            <div className="px-4 py-2 text-xs text-muted-foreground">
              Select the skills to use in your next message.
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {isLoading && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Loading skills…
                </div>
              )}
              {!isLoading && error && (
                <div role="alert" className="px-3 py-6 text-center text-sm text-red-600">
                  {error}
                </div>
              )}
              {!isLoading && !error && skills.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No skills are available for this project.
                </div>
              )}
              {!isLoading &&
                !error &&
                skills.map((skill) => {
                  const selected = selectedSkills.includes(skill.name);
                  return (
                    <button
                      key={skill.name}
                      type="button"
                      onClick={() => onToggle(skill.name)}
                      aria-pressed={selected}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary-accent-foreground",
                        selected && "bg-secondary-accent-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                          selected
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-zinc-400 dark:border-zinc-600",
                        )}
                      >
                        {selected && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {skill.name}
                        </span>
                        <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                          {skill.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </>
        )}
        {activeTab === "prompts" && (
          <>
            <div className="px-4 py-2 text-xs text-muted-foreground">
              Select a prompt to fill in the form.
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {isLoadingPrompts && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Loading prompts…
                </div>
              )}
              {!isLoadingPrompts && promptsError && (
                <div role="alert" className="px-3 py-6 text-center text-sm text-red-600">
                  {promptsError}
                </div>
              )}
              {!isLoadingPrompts && !promptsError && prompts.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No prompts available.
                </div>
              )}
              {!isLoadingPrompts && !promptsError && prompts.map((prompt) => (
                <button
                  key={prompt.name}
                  type="button"
                  onClick={() => {
                    // Launch action: el modal del prompt toma el foco, así
                    // que el dropdown se cierra aquí (antes quedaba abierto
                    // tras el submit del formulario).
                    close();
                    onPromptSelect?.(prompt.name);
                  }}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary-accent-foreground"
                >
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-zinc-400">
                    <FolderOpen size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {prompt.name}
                    </span>
                    <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                      {prompt.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
