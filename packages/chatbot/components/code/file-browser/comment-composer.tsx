"use client";

import { useState } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import type { PendingComment } from "./types";
import { Button } from "@/components/ui/button";

export interface CommentComposerProps {
  lineNumber: number;
  endLine?: number;
  existing?: PendingComment;
  /** Where the comment lives, e.g. "Markdown preview". */
  contextLabel?: string;
  /** Source line(s) the comment is anchored to. */
  sourceText?: string;
  onSave: (text: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}

export const CommentComposer: React.FC<CommentComposerProps> = ({
  lineNumber,
  endLine = lineNumber,
  existing,
  contextLabel,
  sourceText,
  onSave,
  onRemove,
  onCancel,
}) => {
  const [text, setText] = useState(existing?.text ?? "");
  const range =
    lineNumber === endLine
      ? `line ${lineNumber}`
      : `lines ${lineNumber}–${endLine}`;
  const rangeCode =
    lineNumber === endLine ? `L${lineNumber}` : `L${lineNumber}–${endLine}`;

  return (
    <div
      data-comment-composer="true"
      data-comment-anchor="true"
      className="sticky left-0 w-full max-w-[100dvw] overflow-hidden rounded-[7px] border-2 border-zinc-300 bg-background text-foreground shadow-sm dark:border-zinc-700"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="border-l-[3px] border-slate-500 dark:border-slate-400">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-[4px] border border-zinc-200 bg-background text-slate-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-slate-300">
              <MessageSquare size={14} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                {existing ? "Edit comment" : "New comment"}
              </p>
              <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                {contextLabel ?? `Comment on ${range}`}
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-[4px] border border-zinc-200 bg-background px-1.5 py-0.5 font-mono text-[12px] font-medium tabular-nums text-slate-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-slate-300">
            {rangeCode}
          </span>
        </header>

        <div className="p-3">
          {sourceText?.trim() && (
            <p
              className="mb-2 truncate rounded-[4px] border border-zinc-200 border-l-[3px] border-l-slate-400 bg-zinc-50 px-2 py-1.5 font-mono text-[12px] text-zinc-500 dark:border-zinc-800 dark:border-l-slate-500 dark:bg-zinc-900 dark:text-zinc-400"
              title={sourceText}
            >
              {sourceText}
            </p>
          )}
          <textarea
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Leave a comment…"
            aria-label="Comment text"
            rows={2}
            className="w-full resize-none rounded-[5px] border border-zinc-200 bg-background p-2.5 text-sm outline-none placeholder:text-zinc-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/15 dark:border-zinc-700 dark:bg-zinc-950 dark:placeholder:text-zinc-500 dark:focus:border-slate-400 dark:focus:ring-slate-400/15"
          />
          <div className="mt-2.5 flex flex-nowrap items-center gap-1.5">
            {existing && (
              <Button
                variant="icon"
                size="icon"
                type="button"
                aria-label="Delete comment"
                onClick={onRemove}
                className="size-8 rounded-[5px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <Trash2 size={15} />
              </Button>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={onCancel}
                className="h-8 rounded-[5px] border border-zinc-200 bg-background px-2.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-background dark:hover:bg-zinc-900"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                type="button"
                disabled={!text.trim()}
                onClick={() => onSave(text.trim())}
                className="h-8 rounded-[5px] bg-slate-600 px-3 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-slate-300 dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {existing ? "Update" : "Comment"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
