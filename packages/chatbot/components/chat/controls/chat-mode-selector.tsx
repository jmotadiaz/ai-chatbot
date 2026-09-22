"use client";

import type { ClassValue } from "clsx";
import { ChevronUp } from "lucide-react";
import { CHAT_MODE_ICONS, CHAT_MODE_LABELS } from "@/components/chat/chat-mode-display";
import { cn } from "@/lib/utils/helpers";

import { Select, useSelect } from "@/components/ui/select";
import { CHAT_MODES, type ChatMode } from "@/lib/features/chat/types";

import type { DropdownPopupProps } from "@/components/ui/dropdown";

export interface ChatModeSelectorProps {
  className?: ClassValue;
  value: ChatMode;
  onValueChange: (chatMode: ChatMode) => void;
  variant?: DropdownPopupProps["variant"];
}

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
        {CHAT_MODES.map((chatModeKey) => {
          const Icon = CHAT_MODE_ICONS[chatModeKey];
          return (
            <Select.Item key={chatModeKey} {...getSelectItemProps(chatModeKey)}>
              <div className="flex flex-nowrap items-center gap-2 p-2">
                <Icon size={16} />
                <span className={cn("text-sm whitespace-nowrap")}>
                  {CHAT_MODE_LABELS[chatModeKey]}
                </span>
              </div>
            </Select.Item>
          );
        })}
      </Select.Dropdown>
    </Select.Container>
  );
};
