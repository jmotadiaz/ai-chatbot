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
  <div className="flex max-w-56 shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 py-1 pl-3 pr-1 text-xs">
    <MessageSquare size={12} className="shrink-0 text-amber-500" />
    <span className="shrink-0 font-medium">{label(comment)}</span>
    <span className="truncate text-zinc-500 dark:text-zinc-400">
      {comment.text}
    </span>
    <button
      type="button"
      aria-label={removeLabel(comment)}
      onClick={onRemove}
      disabled={disabled}
      className="shrink-0 rounded-full p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
    >
      <X size={12} />
    </button>
  </div>
);
