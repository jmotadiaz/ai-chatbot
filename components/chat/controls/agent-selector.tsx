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
  rag: "RAG Agent",
  web: "Web Agent",
  context7: "Context7 Agent",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AGENT_ICONS: Record<Agent, React.ComponentType<any>> = {
  rag: FileSearch,
  web: Globe,
  context7: MCPIcon,
};

export const AgentSelector = ({
  className,
  value,
  onValueChange,
  variant = "top-right",
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
      <Select.Dropdown
        {...getSelectContentProps()}
        variant={variant}
        className="lg:w-[220px]"
      >
        {Object.entries(AGENT_LABELS).map(([key, label]) => {
          const agentKey = key as Agent;
          const Icon = AGENT_ICONS[agentKey];
          return (
            <Select.Item
              key={agentKey}
              {...getSelectItemProps(agentKey)}
              className="py-2.5"
            >
              <div className="flex items-center gap-3">
                <Icon
                  size={16}
                  className={cn(
                    "text-muted-foreground",
                    value === agentKey && "text-foreground",
                  )}
                />
                <span
                  className={cn(
                    "text-sm",
                    value === agentKey
                      ? "font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </div>
            </Select.Item>
          );
        })}
      </Select.Dropdown>
    </Select.Container>
  );
};
