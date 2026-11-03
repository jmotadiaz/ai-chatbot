"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { PendingComment } from "./types";
import { Button } from "@/components/ui/button";

export interface CommentComposerProps {
  lineNumber: number;
  endLine?: number;
  existing?: PendingComment;
  onSave: (text: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}

export const CommentComposer: React.FC<CommentComposerProps> = ({
  lineNumber,
  endLine = lineNumber,
  existing,
  onSave,
  onRemove,
  onCancel,
}) => {
  const [text, setText] = useState(existing?.text ?? "");
  const range =
    lineNumber === endLine
      ? `line ${lineNumber}`
      : `lines ${lineNumber}–${endLine}`;

  return (
    <div
      className="sticky left-0 w-full max-w-[100dvw] border-y border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-3"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
        Comment on {range}
      </p>
      <textarea
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Leave a comment…"
        rows={2}
        className="w-full resize-none rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 p-2 text-sm outline-none focus:border-zinc-500"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        {existing && (
          <Button
            variant="icon"
            size="icon"
            type="button"
            aria-label="Delete comment"
            onClick={onRemove}
          >
            <Trash2 size={16} className="text-red-500" />
          </Button>
        )}
        <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          type="button"
          disabled={!text.trim()}
          onClick={() => onSave(text.trim())}
        >
          {existing ? "Update" : "Comment"}
        </Button>
      </div>
    </div>
  );
};
