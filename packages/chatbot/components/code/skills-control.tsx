"use client";

import { Check, Puzzle } from "lucide-react";
import { ChatControl } from "@/components/chat/control";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils/helpers";

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
}

export const SkillsControl: React.FC<SkillsControlProps> = ({
  skills,
  selectedSkills,
  onToggle,
  isLoading = false,
  error,
}) => {
  const { getDropdownPopupProps, getDropdownTriggerProps } = useDropdown();

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
        <div className="border-b border-muted px-4 py-3">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Skills
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Select the skills to use in your next message.
          </div>
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
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
