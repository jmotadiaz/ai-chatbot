"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/helpers";

export interface CollapsibleProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}

export const Collapsible: React.FC<CollapsibleProps> = ({
  title,
  isOpen,
  onToggle,
  children,
  className,
}) => {
  return (
    <div className={cn("border-t border-zinc-200 dark:border-zinc-700", className)}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-4 text-left text-lg font-semibold text-zinc-900 dark:text-zinc-100 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
        aria-expanded={isOpen}
      >
        {title}
        <ChevronDown
          className={cn(
            "h-5 w-5 text-zinc-500 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-200 ease-in-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
};

