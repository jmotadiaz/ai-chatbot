"use client";

import type { ClassValue } from "clsx";
import { FileSearch, Globe, ChevronUp } from "lucide-react";
import { MCPIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/helpers";

import { Select, useSelect } from "@/components/ui/select";
import type { Agent } from "@/lib/features/chat/types";

import type { DropdownPopupProps } from "@/components/ui/dropdown";

export interface AgentSelectorProps {
  className?: ClassValue;
  value: Agent;
  onValueChange: (agent: Agent) => void;
  variant?: DropdownPopupProps["variant"];
}

const AGENT_LABELS: Record<Agent, string> = {
  context7: "Ctx7 Agent",
  rag: "RAG Agent",
  web: "Web Agent",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AGENT_ICONS: Record<Agent, React.ComponentType<any>> = {
  context7: MCPIcon,
  rag: FileSearch,
  web: Globe,
};

export const AgentSelector = ({
  className,
  value,
  onValueChange,
  variant = "top-left",
}: AgentSelectorProps) => {
  const { getSelectTriggerProps, getSelectContentProps, getSelectItemProps } =
    useSelect({
      value,
      onValueChange,
      id: "agent-selector",
    });

  const CurrentIcon = AGENT_ICONS[value];
  const { toggle, isOpen } = getSelectTriggerProps();

  return (
    <Select.Container className={cn("inline-block", className)}>
      <button
        onClick={toggle}
        type="button"
        className="flex items-center space-x-2 font-semibold text-black dark:text-white select-none cursor-pointer text-[15px] hover:opacity-80 transition-opacity px-2"
      >
        <CurrentIcon size={18} />
        <span className="truncate">{AGENT_LABELS[value]}</span>
        <ChevronUp
          size={16}
          className={cn(
            "transition-transform duration-300",
            isOpen ? "rotate-0" : "rotate-180",
          )}
        />
      </button>
      <Select.Dropdown {...getSelectContentProps()} variant={variant}>
        {Object.entries(AGENT_LABELS).map(([key, label]) => {
          const agentKey = key as Agent;
          const Icon = AGENT_ICONS[agentKey];
          return (
            <Select.Item key={agentKey} {...getSelectItemProps(agentKey)}>
              <div className="flex flex-nowrap items-center gap-2 p-2">
                <Icon size={16} />
                <span className={cn("text-sm whitespace-nowrap")}>{label}</span>
              </div>
            </Select.Item>
          );
        })}
      </Select.Dropdown>
    </Select.Container>
  );
};
