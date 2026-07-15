"use client";

import { memo } from "react";
import { MessageSquare } from "lucide-react";
import type { ThemedToken } from "shiki";
import { cn } from "@/lib/utils/helpers";

export interface CodeViewLineProps {
  lineNumber: number;
  tokens: ThemedToken[];
  isChanged: boolean;
  hasComment: boolean;
  isSelected: boolean;
  onSelect: (lineNumber: number) => void;
}

export const CodeViewLine = memo<CodeViewLineProps>(
  ({ lineNumber, tokens, isChanged, hasComment, isSelected, onSelect }) => (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Line ${lineNumber}`}
      onClick={() => onSelect(lineNumber)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(lineNumber);
        }
      }}
      className={cn(
        "flex w-max min-w-full cursor-pointer items-stretch font-mono text-xs leading-6",
        isSelected && "bg-blue-500/10",
        !isSelected && hasComment && "bg-amber-500/10",
      )}
    >
      <span
        className={cn(
          "sticky left-0 flex w-14 shrink-0 select-none items-center justify-end gap-1 border-l-2 pr-2 text-zinc-400 dark:text-zinc-500 bg-(--background)",
          isChanged ? "border-emerald-500 bg-emerald-500/10" : "border-transparent",
        )}
      >
        {hasComment && (
          <MessageSquare size={10} className="text-amber-500" />
        )}
        {lineNumber}
      </span>
      <span className="whitespace-pre pl-3 pr-4">
        {tokens.length === 0
          ? " "
          : tokens.map((token, idx) => (
              <span key={idx} style={{ color: token.color }}>
                {token.content}
              </span>
            ))}
      </span>
    </div>
  ),
);

CodeViewLine.displayName = "CodeViewLine";
