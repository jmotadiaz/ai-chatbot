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
   * Popup controlado: si se proveen, el parent gobierna la apertura (el
   * flujo de prompts cierra el dropdown al insertar el texto, pero lo deja
   * abierto al cancelar el modal). Sin `open`, el control es autónomo.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Bloqueo mid-turn (ticket 03): skills y prompts no viajan en la cola
   * de texto plano v1.
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
  const setOpen = (next: boolean) => {
    startTransition(() => {
      // Cerrar resetea la tab a `skills`; las queries viven en cada panel
      // (estado no elevado) y se limpian al desmontarse el popup/tab.
      if (!next) setActiveTab("skills");
      if (open !== undefined) onOpenChange?.(next);
      else setInternalOpen(next);
    });
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
              onClick={() => setActiveTab("skills")}
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
              onClick={() => setActiveTab("prompts")}
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
        {activeTab === "skills" && (
          <SkillsPanel
            skills={skills}
            selectedSkills={selectedSkills}
            onToggle={onToggle}
            isLoading={isLoading}
            error={error}
          />
        )}
        {activeTab === "prompts" && (
          <PromptsPanel
            prompts={prompts}
            isLoadingPrompts={isLoadingPrompts}
            promptsError={promptsError}
            onPromptSelect={onPromptSelect}
          />
        )}
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};

/** Match v1: solo `name`, case-insensitive, substring con `trim()`. */
function matchesName(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return name.toLowerCase().includes(q);
}

interface FilterInputProps {
  value: string;
  onChange: (next: string) => void;
  onEnter: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  ariaLabel: string;
  testId: string;
  placeholder: string;
}

const FilterInput: React.FC<FilterInputProps> = ({
  value,
  onChange,
  onEnter,
  inputRef,
  ariaLabel,
  testId,
  placeholder,
}) => (
  // Div (no form): el control vive dentro del <form> del composer y un
  // <form> anidado provocaría submits del mensaje con Enter.
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
        data-testid={testId}
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

/**
 * Autofocus post-animación: el `Popup` entra con ~0.18s de animación y en
 * mobile es bottom-sheet; el timeout espera al montaje visual para que el
 * foco abra el teclado virtual. Al vivir la query en cada panel (estado no
 * elevado), montar = abrir popup o cambiar a esta tab, siempre con input
 * vacío y foco en él.
 */
function useFilterFocus(inputRef: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, [inputRef]);
}

interface SkillsPanelProps {
  skills: CodingAgentSkill[];
  selectedSkills: string[];
  onToggle: (name: string) => void;
  isLoading: boolean;
  error?: string | null;
}

const SkillsPanel: React.FC<SkillsPanelProps> = ({
  skills,
  selectedSkills,
  onToggle,
  isLoading,
  error,
}) => {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useFilterFocus(inputRef);
  const filtered = skills.filter((s) => matchesName(s.name, query));
  const handleEnter = () => {
    if (isLoading || error) return;
    const first = filtered[0];
    if (first) onToggle(first.name);
  };
  return (
    <>
      <FilterInput
        value={query}
        onChange={setQuery}
        onEnter={handleEnter}
        inputRef={inputRef}
        ariaLabel="Filter skills"
        testId="skills-filter-input"
        placeholder="Filter skills…"
      />
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
        {!isLoading && !error && skills.length > 0 && filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No results for &quot;{query.trim()}&quot;.
          </div>
        )}
        {!isLoading &&
          !error &&
          filtered.map((skill) => {
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
};

interface PromptsPanelProps {
  prompts: PromptSummary[];
  isLoadingPrompts: boolean;
  promptsError?: string | null;
  onPromptSelect?: (promptName: string) => void;
}

const PromptsPanel: React.FC<PromptsPanelProps> = ({
  prompts,
  isLoadingPrompts,
  promptsError,
  onPromptSelect,
}) => {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useFilterFocus(inputRef);
  const filtered = prompts.filter((p) => matchesName(p.name, query));
  const handleEnter = () => {
    if (isLoadingPrompts || promptsError) return;
    const first = filtered[0];
    if (first) onPromptSelect?.(first.name);
  };
  return (
    <>
      <FilterInput
        value={query}
        onChange={setQuery}
        onEnter={handleEnter}
        inputRef={inputRef}
        ariaLabel="Filter prompts"
        testId="prompts-filter-input"
        placeholder="Filter prompts…"
      />
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
        {!isLoadingPrompts && !promptsError && prompts.length > 0 && filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No results for &quot;{query.trim()}&quot;.
          </div>
        )}
        {!isLoadingPrompts &&
          !promptsError &&
          filtered.map((prompt) => (
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
};
