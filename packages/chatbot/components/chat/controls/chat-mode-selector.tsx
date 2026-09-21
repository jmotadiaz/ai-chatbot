"use client";

import type { ClassValue } from "clsx";
import { FileSearch, Globe, ChevronUp } from "lucide-react";
import { MCPIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/helpers";

import { Select, useSelect } from "@/components/ui/select";
import type { ChatMode } from "@/lib/features/chat/types";

import type { DropdownPopupProps } from "@/components/ui/dropdown";

export interface ChatModeSelectorProps {
  className?: ClassValue;
  value: ChatMode;
  onValueChange: (chatMode: ChatMode) => void;
  variant?: DropdownPopupProps["variant"];
}

const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  context7: "Ctx7",
  rag: "RAG",
  web: "Web",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CHAT_MODE_ICONS: Record<ChatMode, React.ComponentType<any>> = {
  context7: MCPIcon,
  rag: FileSearch,
  web: Globe,
};

export const ChatModeSelector = ({
  className,
  value,
  onValueChange,
  variant = "top-left",
}: ChatModeSelectorProps) => {
  const { getSelectTriggerProps, getSelectContentProps, getSelectItemProps } =
    useSelect({
      value,
      onValueChange,
      id: "chat-mode-selector",
    });

  const CurrentIcon = CHAT_MODE_ICONS[value];
  const { toggle, isOpen } = getSelectTriggerProps();

  return (
    <Select.Container className={cn("inline-block", className)}>
      <button
        onClick={toggle}
        type="button"
        className="flex items-center space-x-2 font-semibold text-black dark:text-white select-none cursor-pointer text-[15px] hover:opacity-80 transition-opacity px-2"
      >
        <CurrentIcon size={18} />
        <span className="truncate">{CHAT_MODE_LABELS[value]}</span>
        <ChevronUp
          size={16}
          className={cn(
            "transition-transform duration-300",
            isOpen ? "rotate-0" : "rotate-180",
          )}
        />
      </button>
      <Select.Dropdown {...getSelectContentProps()} variant={variant}>
        {Object.entries(CHAT_MODE_LABELS).map(([key, label]) => {
          const chatModeKey = key as ChatMode;
          const Icon = CHAT_MODE_ICONS[chatModeKey];
          return (
            <Select.Item key={chatModeKey} {...getSelectItemProps(chatModeKey)}>
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
