"use client";

import { memo } from "react";
import { MessageSquare } from "lucide-react";
import type { ThemedToken } from "shiki";
import type { DiffLineKind } from "./types";
import { cn } from "@/lib/utils/helpers";

export interface CodeViewLineProps {
  oldLineNumber: number | null;
  newLineNumber: number | null;
  tokens: ThemedToken[];
  changeKind: DiffLineKind | "unchanged";
  hasComment: boolean;
  isSelected: boolean;
  onSelect: (lineNumber: number) => void;
}

export const CodeViewLine = memo<CodeViewLineProps>(
  ({
    oldLineNumber,
    newLineNumber,
    tokens,
    changeKind,
    hasComment,
    isSelected,
    onSelect,
  }) => {
    const isDiffLine = changeKind !== "unchanged";
    const isCommentable = newLineNumber !== null;
    const lineNumber = newLineNumber ?? oldLineNumber ?? 0;
    const diffGutterClass =
      changeKind === "added"
        ? "bg-emerald-100 dark:bg-emerald-950"
        : changeKind === "deleted"
          ? "bg-red-100 dark:bg-red-950"
          : "bg-(--background)";
    const selectLine = () => {
      if (newLineNumber !== null) onSelect(newLineNumber);
    };

    return (
      <div
        role={isCommentable ? "button" : undefined}
        tabIndex={isCommentable ? 0 : undefined}
        aria-label={`Line ${lineNumber}`}
        aria-disabled={!isCommentable}
        onClick={selectLine}
        onKeyDown={(e) => {
          if (!isCommentable || (e.key !== "Enter" && e.key !== " ")) return;
          e.preventDefault();
          selectLine();
        }}
        className={cn(
          "flex w-max min-w-full items-stretch font-mono text-xs leading-6",
          isCommentable && "cursor-pointer",
          changeKind === "added" && "bg-emerald-100 dark:bg-emerald-950",
          changeKind === "deleted" && "bg-red-100 dark:bg-red-950",
          isSelected && "bg-blue-500/10",
          !isSelected && hasComment && "bg-amber-500/10",
        )}
      >
        {isDiffLine ? (
          <>
            <span
              className={cn(
                "sticky left-0 z-10 flex w-10 shrink-0 select-none items-center justify-end pr-1 text-zinc-400 dark:text-zinc-500",
                diffGutterClass,
              )}
            >
              {oldLineNumber ?? ""}
            </span>
            <span
              className={cn(
                "sticky left-10 z-10 flex w-10 shrink-0 select-none items-center justify-end pr-1 text-zinc-400 dark:text-zinc-500",
                diffGutterClass,
              )}
            >
              {hasComment && (
                <MessageSquare size={10} className="mr-1 text-amber-500" />
              )}
              {newLineNumber ?? ""}
            </span>
            <span className="w-5 shrink-0 select-none text-center text-zinc-500">
              {changeKind === "added" ? "+" : changeKind === "deleted" ? "-" : " "}
            </span>
          </>
        ) : (
          <span
            className={cn(
              "sticky left-0 flex w-14 shrink-0 select-none items-center justify-end gap-1 border-l-2 bg-(--background) pr-2 text-zinc-400 dark:text-zinc-500",
              "border-transparent",
            )}
          >
            {hasComment && (
              <MessageSquare size={10} className="text-amber-500" />
            )}
            {newLineNumber}
          </span>
        )}
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
    );
  },
);

CodeViewLine.displayName = "CodeViewLine";
