"use client";

import type { ThinkingLevel } from "models";
import { Check, Settings2 } from "lucide-react";
import { ChatControl } from "@/components/chat/control";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils/helpers";

export interface ReasoningControlProps {
  /** Nivel que se aplicará en el próximo turno. */
  level: ThinkingLevel | null;
  /** Niveles del modelo seleccionado en el picker. */
  levels: ThinkingLevel[];
  onSelect: (level: ThinkingLevel) => void;
  /**
   * Bloqueo mid-turn (ticket 03): el thinking se snapshottea al arrancar
   * el run, así que cambiarlo en Turn activo no aplicaría hasta el
   * próximo Turn. Sin tooltip: simplemente no aplica.
   */
  disabled?: boolean;
}

export const ReasoningControl: React.FC<ReasoningControlProps> = ({
  level,
  levels,
  onSelect,
  disabled = false,
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
        disabled={disabled || level === null}
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
                "flex w-full items-center justify-between px-4 py-2 text-sm hover:bg-secondary-accent",
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
