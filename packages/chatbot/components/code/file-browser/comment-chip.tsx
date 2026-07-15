"use client";

import { MessageSquare, X } from "lucide-react";
import type { PendingComment } from "./types";

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

export interface CommentChipProps {
  comment: PendingComment;
  onRemove: () => void;
}

export const CommentChip: React.FC<CommentChipProps> = ({
  comment,
  onRemove,
}) => (
  <div className="flex max-w-56 shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 py-1 pl-3 pr-1 text-xs">
    <MessageSquare size={12} className="shrink-0 text-amber-500" />
    <span className="shrink-0 font-medium">
      {basename(comment.file)}:{comment.startLine}
    </span>
    <span className="truncate text-zinc-500 dark:text-zinc-400">
      {comment.text}
    </span>
    <button
      type="button"
      aria-label={`Remove comment on ${comment.file} line ${comment.startLine}`}
      onClick={onRemove}
      className="shrink-0 rounded-full p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
    >
      <X size={12} />
    </button>
  </div>
);
