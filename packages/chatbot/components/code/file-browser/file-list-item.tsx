"use client";

import { ChevronRight, FileText, Folder } from "lucide-react";
import type { GitChangeStatus } from "./types";
import { cn } from "@/lib/utils/helpers";

const BADGE_STYLES: Record<GitChangeStatus, { label: string; className: string }> = {
  modified: { label: "modified", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  added: { label: "added", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  untracked: { label: "new", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  renamed: { label: "renamed", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  deleted: { label: "deleted", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

export interface FileListItemProps {
  title: string;
  subtitle?: string;
  isDir?: boolean;
  badge?: GitChangeStatus;
  commentCount?: number;
  disabled?: boolean;
  onSelect: () => void;
}

export const FileListItem: React.FC<FileListItemProps> = ({
  title,
  subtitle,
  isDir = false,
  badge,
  commentCount = 0,
  disabled = false,
  onSelect,
}) => (
  <li>
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full min-h-12 items-center gap-3 px-4 py-2 text-left cursor-pointer",
        "hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors",
        disabled && "opacity-50 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent",
      )}
    >
      {isDir ? (
        <Folder size={18} className="shrink-0 text-sky-500" />
      ) : (
        <FileText size={18} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{title}</span>
        {subtitle && (
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </span>
        )}
      </span>
      {commentCount > 0 && (
        <span className="shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400">
          {commentCount} 💬
        </span>
      )}
      {badge && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            BADGE_STYLES[badge].className,
          )}
        >
          {BADGE_STYLES[badge].label}
        </span>
      )}
      {isDir && (
        <ChevronRight size={16} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
      )}
    </button>
  </li>
);
