"use client";

import type { ThinkingLevel } from "models";
import { Check, Settings2 } from "lucide-react";
import { ChatControl } from "@/components/chat/control";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils/helpers";

export interface ReasoningControlProps {
  level: ThinkingLevel | null;
  levels: ThinkingLevel[];
  isLoading: boolean;
  /** true mientras un cambio de modelo se está aplicando en el worker; el control se deshabilita. */
  isApplying?: boolean;
  onSelect: (level: ThinkingLevel) => void;
}

export const ReasoningControl: React.FC<ReasoningControlProps> = ({
  level,
  levels,
  isLoading,
  isApplying = false,
  onSelect,
}) => {
  const { getDropdownPopupProps, getDropdownTriggerProps } = useDropdown();

  // El modelo no razona (solo "off" disponible): sin control.
  if (levels.length <= 1) return null;

  return (
    <Dropdown.Container data-testid="coding-agent-reasoning-control">
      <ChatControl
        Icon={Settings2}
        type="button"
        aria-label={`Reasoning effort: ${level ?? "…"}`}
        title={`Reasoning effort: ${level ?? "…"}`}
        disabled={isLoading || level === null || isApplying}
        {...getDropdownTriggerProps()}
      />
      <Dropdown.Popup
        {...getDropdownPopupProps()}
        variant="responsive-top-right"
        className="w-48"
      >
        <div className="py-2">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Reasoning effort
          </div>
          {levels.map((item) => (
            <button
              key={item}
              type="button"
              role="menuitem"
              onClick={() => onSelect(item)}
              className={cn(
                "flex w-full items-center justify-between px-4 py-2 text-sm hover:bg-secondary-accent-foreground",
                item === level && "font-semibold",
              )}
            >
              <span className="capitalize">{item}</span>
              {item === level && <Check size={16} />}
            </button>
          ))}
        </div>
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
