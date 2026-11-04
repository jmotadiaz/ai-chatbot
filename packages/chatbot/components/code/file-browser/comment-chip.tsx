"use client";

import { MessageSquare, X } from "lucide-react";
import { isResponseComment, type PendingComment } from "./types";

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function label(comment: PendingComment): string {
  if (isResponseComment(comment)) {
    const range =
      comment.startLine === comment.endLine
        ? `L${comment.startLine}`
        : `L${comment.startLine}–${comment.endLine}`;
    return `Response ${comment.turnNumber} · ${range}`;
  }
  return `${basename(comment.file)}:${comment.startLine}`;
}

function removeLabel(comment: PendingComment): string {
  if (isResponseComment(comment)) {
    return `Remove comment on Response ${comment.turnNumber} line ${comment.startLine}`;
  }
  return `Remove comment on ${comment.file} line ${comment.startLine}`;
}

export interface CommentChipProps {
  comment: PendingComment;
  onRemove: () => void;
  /** Mid-turn lock: comments do not travel in the queue. */
  disabled?: boolean;
}

export const CommentChip: React.FC<CommentChipProps> = ({
  comment,
  onRemove,
  disabled = false,
}) => (
  <div className="flex max-w-72 shrink-0 items-center gap-2 rounded-md border border-zinc-200 bg-background py-1 pl-1.5 pr-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
    <span className="grid size-6 shrink-0 place-items-center rounded-[4px] border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
      <MessageSquare size={12} aria-hidden="true" />
    </span>
    <span className="min-w-0 flex-1 leading-tight">
      <span className="block truncate font-mono text-[12px] font-semibold text-zinc-800 dark:text-zinc-100">
        {label(comment)}
      </span>
      <span className="block truncate text-[12px] text-zinc-500 dark:text-zinc-400">
        {comment.text}
      </span>
    </span>
    <button
      type="button"
      aria-label={removeLabel(comment)}
      onClick={onRemove}
      disabled={disabled}
      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[4px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      <X size={13} />
    </button>
  </div>
);
