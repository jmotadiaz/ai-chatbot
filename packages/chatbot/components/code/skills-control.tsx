"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { Check, FolderOpen, Puzzle, Search, X } from "lucide-react";
import { ChatControl } from "@/components/chat/control";
import { Dropdown } from "@/components/ui/dropdown";
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
  /**
   * Controlled popup: when provided, the parent governs opening (the prompts
   * flow closes the dropdown when inserting the text, but leaves it open on
   * cancel). Without `open`, the control is autonomous.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Mid-turn lock (ticket 03): skills and prompts do not travel in the v1
   * plain-text queue.
   */
  disabled?: boolean;
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
  open,
  onOpenChange,
  disabled = false,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const [activeTab, setActiveTab] = useState<"skills" | "prompts">("skills");
  // Single shared input: lives in the control (lifted state) so switching
  // tabs does not unmount the <input> and the virtual keyboard does not
  // close and reopen. The query is preserved across tab changes.
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const setOpen = (next: boolean) => {
    startTransition(() => {
      // Closing resets tab and query; on reopen the input mounts empty.
      if (!next) {
        setActiveTab("skills");
        setQuery("");
      }
      if (open !== undefined) onOpenChange?.(next);
      else setInternalOpen(next);
    });
  };

  const filteredSkills = skills.filter((s) => matchesName(s.name, query));
  const filteredPrompts = prompts.filter((p) => matchesName(p.name, query));

  const handleEnter = () => {
    if (activeTab === "skills") {
      if (isLoading || error) return;
      const first = filteredSkills[0];
      if (first) onToggle(first.name);
    } else {
      if (isLoadingPrompts || promptsError) return;
      const first = filteredPrompts[0];
      if (first) onPromptSelect?.(first.name);
    }
  };

  return (
    <Dropdown.Container data-testid="coding-agent-skills-control">
      <ChatControl
        Icon={Puzzle}
        type="button"
        aria-label="Select skills"
        title="Select skills"
        isActive={selectedSkills.length > 0}
        disabled={disabled}
        onClick={() => setOpen(!isOpen)}
      />
      <Dropdown.Popup
        isShown={isOpen}
        close={() => setOpen(false)}
        variant="responsive-top-right"
        className="w-full lg:w-96"
        avoidKeyboard
      >
        <div className="border-b border-muted">
          <div className="flex" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === "skills"}
              // A tap would move focus to the button and close the keyboard:
              // focus theft is prevented and focus is returned to the input in
              // the same gesture so the keyboard does not flicker. Via keyboard
              // (Tab+Enter) focus keeps working as usual.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                setActiveTab("skills");
                inputRef.current?.focus();
              }}
              className={cn(
                "flex-1 px-4 py-3 text-sm font-semibold text-center transition-colors border-b-2 -mb-px",
                activeTab === "skills"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-zinc-600 hover:bg-secondary-accent hover:text-foreground",
              )}
            >
              Skills
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "prompts"}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                setActiveTab("prompts");
                inputRef.current?.focus();
              }}
              className={cn(
                "flex-1 px-4 py-3 text-sm font-semibold text-center transition-colors border-b-2 -mb-px",
                activeTab === "prompts"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-zinc-600 hover:bg-secondary-accent hover:text-foreground",
              )}
            >
              Prompts
            </button>
          </div>
        </div>
        {/*
         * Single input below the tabs, outside the scroll: mounted once per
         * opening so focus (and the keyboard) is not lost when switching
         * tabs. Only its label/placeholder changes with the active tab.
         */}
        <PopupFilterInput
          value={query}
          onChange={setQuery}
          onEnter={handleEnter}
          inputRef={inputRef}
          activeTab={activeTab}
        />
        {activeTab === "skills" && (
          <SkillsList
            skills={filteredSkills}
            totalCount={skills.length}
            query={query}
            selectedSkills={selectedSkills}
            onToggle={onToggle}
            isLoading={isLoading}
            error={error}
          />
        )}
        {activeTab === "prompts" && (
          <PromptsList
            prompts={filteredPrompts}
            totalCount={prompts.length}
            query={query}
            isLoadingPrompts={isLoadingPrompts}
            promptsError={promptsError}
            onPromptSelect={onPromptSelect}
          />
        )}
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};

/** v1 match: `name` only, case-insensitive, substring on `trim()`. */
function matchesName(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return name.toLowerCase().includes(q);
}

interface PopupFilterInputProps {
  value: string;
  onChange: (next: string) => void;
  onEnter: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  activeTab: "skills" | "prompts";
}

const PopupFilterInput: React.FC<PopupFilterInputProps> = ({
  value,
  onChange,
  onEnter,
  inputRef,
  activeTab,
}) => {
  // Post-animation autofocus only on mount (popup opening): the input does
  // not unmount when switching tabs, so focus/keyboard are preserved.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, [inputRef]);

  const ariaLabel = activeTab === "skills" ? "Filter skills" : "Filter prompts";
  const placeholder =
    activeTab === "skills" ? "Filter skills…" : "Filter prompts…";

  return (
    // Div (not form): the control lives inside the composer's <form> and a
    // nested <form> would trigger message submits on Enter.
    <div role="search" className="border-b border-muted px-3 py-2">
      <div className="relative">
        <Search
          size={14}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={inputRef}
          type="search"
          role="searchbox"
          aria-label={ariaLabel}
          data-testid="skills-prompts-filter-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              onEnter();
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="w-full rounded-lg border border-input bg-background py-2 pr-8 pl-9 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        {value && (
          <button
            type="button"
            aria-label="Clear filter"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-secondary-accent hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

interface SkillsListProps {
  skills: CodingAgentSkill[];
  totalCount: number;
  query: string;
  selectedSkills: string[];
  onToggle: (name: string) => void;
  isLoading: boolean;
  error?: string | null;
}

const SkillsList: React.FC<SkillsListProps> = ({
  skills,
  totalCount,
  query,
  selectedSkills,
  onToggle,
  isLoading,
  error,
}) => (
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
      {!isLoading && !error && totalCount === 0 && (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
          No skills are available for this project.
        </div>
      )}
      {!isLoading && !error && totalCount > 0 && skills.length === 0 && (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
          No results for &quot;{query.trim()}&quot;.
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
                "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary-accent",
                selected && "bg-secondary-accent",
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
);

interface PromptsListProps {
  prompts: PromptSummary[];
  totalCount: number;
  query: string;
  isLoadingPrompts: boolean;
  promptsError?: string | null;
  onPromptSelect?: (promptName: string) => void;
}

const PromptsList: React.FC<PromptsListProps> = ({
  prompts,
  totalCount,
  query,
  isLoadingPrompts,
  promptsError,
  onPromptSelect,
}) => (
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
      {!isLoadingPrompts && !promptsError && totalCount === 0 && (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
          No prompts available.
        </div>
      )}
      {!isLoadingPrompts && !promptsError && totalCount > 0 && prompts.length === 0 && (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
          No results for &quot;{query.trim()}&quot;.
        </div>
      )}
      {!isLoadingPrompts &&
        !promptsError &&
        prompts.map((prompt) => (
          <button
            key={prompt.name}
            type="button"
            onClick={() => onPromptSelect?.(prompt.name)}
            className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary-accent"
          >
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-zinc-400">
              <FolderOpen size={14} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{prompt.name}</span>
              <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                {prompt.description}
              </span>
            </span>
          </button>
        ))}
    </div>
  </>
);
