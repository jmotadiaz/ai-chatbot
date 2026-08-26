"use client";

import * as React from "react";
import { useState, useCallback } from "react";
import {
  Terminal,
  FileText,
  FilePlus,
  Pencil,
  Search,
  FolderOpen,
  Wrench,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { ToolCallDetail } from "./tool-call-detail";
import { Shimmer } from "@/components/ui/shimmer";
import type { ToolCallGroup as Group } from "@/lib/features/code/types";
import { cn } from "@/lib/utils/helpers";

const TOOL_ICONS: Record<string, LucideIcon> = {
  bash: Terminal, shell: Terminal,
  read: FileText, write: FilePlus, edit: Pencil,
  grep: Search, find: FolderOpen, ls: FolderOpen, subagent: Bot,
};

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  bash: "Shell", shell: "Shell",
  read: "Read", write: "Write", edit: "Edit",
  grep: "Grep", find: "Find", ls: "Ls", subagent: "Subagent",
};

export interface ToolCallGroupProps { group: Group }

export const ToolCallGroup = React.memo<ToolCallGroupProps>(
  ({ group }) => {
    const [open, setOpen] = useState(false);
    const toggle = useCallback(() => setOpen((v) => !v), []);
    const Icon = TOOL_ICONS[group.name.toLowerCase()] ?? Wrench;
    const displayName = TOOL_DISPLAY_NAMES[group.name.toLowerCase()] ?? group.name;
    const isRunning = group.status === "running";
    const isError = group.status === "error";

    const rowColor = isError
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground";

    return (
      <div data-testid="tool-call-group" data-tool={group.name} data-status={group.status} className="w-fit max-w-full">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`tool-detail-${group.id}`}
          onClick={toggle}
          className={cn(
            "flex items-center gap-2 py-1.5 text-sm w-fit max-w-full text-left hover:bg-muted/40 rounded-md -mx-1 px-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            rowColor
          )}
        >
          <Icon className={cn("size-4 shrink-0", rowColor)} />
          {isRunning ? (
            <Shimmer as="span" className="inline-flex items-center gap-1.5 min-w-0" textLength={displayName.length + group.summary.length}>
              <span className="font-medium shrink-0">{displayName}</span>
              <span title={group.summary} className="truncate max-w-48 min-w-0">{group.summary}</span>
            </Shimmer>
          ) : (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span className="font-medium shrink-0">{displayName}</span>
              <span title={group.summary} className="truncate max-w-48 min-w-0">{group.summary}</span>
            </span>
          )}
        </button>
        {open && (
          <div id={`tool-detail-${group.id}`}>
            <ToolCallDetail group={group} />
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    const p = prev.group, n = next.group;
    return (
      p.id === n.id && p.name === n.name && p.status === n.status &&
      p.result === n.result && p.startedAt === n.startedAt &&
      p.finishedAt === n.finishedAt && p.summary === n.summary && p.args === n.args
    );
  }
);

ToolCallGroup.displayName = "ToolCallGroup";
