"use client";

import * as React from "react";
import { useState } from "react";
import {
  Terminal,
  FileText,
  FilePlus,
  Pencil,
  Search,
  FolderOpen,
  Wrench,
  Check,
  X,
  Loader2,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import type { ToolCallGroup as Group } from "@/lib/features/code/types";

const TOOL_ICONS: Record<string, LucideIcon> = {
  bash: Terminal,
  shell: Terminal,
  read: FileText,
  write: FilePlus,
  edit: Pencil,
  grep: Search,
  find: FolderOpen,
  ls: FolderOpen,
};

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  bash: "Shell",
  shell: "Shell",
  read: "Read",
  write: "Write",
  edit: "Edit",
  grep: "Grep",
  find: "Find",
  ls: "Ls",
};

const MAX_LINES = 20;

export interface ToolCallGroupProps {
  group: Group;
}

export const ToolCallGroup = React.memo<ToolCallGroupProps>(
  ({ group }) => {
    const [expanded, setExpanded] = useState(false);
    const Icon = TOOL_ICONS[group.name.toLowerCase()] ?? Wrench;
    const displayName =
      TOOL_DISPLAY_NAMES[group.name.toLowerCase()] ?? group.name;
    const lines = (group.result ?? "").split("\n");
    const clamped = lines.length > MAX_LINES && !expanded;
    const visibleResult = clamped
      ? lines.slice(0, MAX_LINES).join("\n")
      : (group.result ?? "");

    return (
      <details
        data-testid="tool-call-group"
        data-tool={group.name}
        data-status={group.status}
        className="my-2 rounded-md border border-border bg-card overflow-hidden group"
      >
        <summary className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          <Icon className="size-4 text-muted-foreground" />
          <span className="font-medium">{displayName}</span>
          <span className="text-muted-foreground truncate flex-1">
            {group.summary}
          </span>
          {group.status === "running" && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
          {group.status === "ok" && (
            <Check className="size-4 text-green-600" data-testid="status-ok" />
          )}
          {group.status === "error" && (
            <X className="size-4 text-red-600" data-testid="status-error" />
          )}
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div>
          <div className="border-t border-border">
            <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground">
              Args
            </div>
            <pre className="px-3 pb-2 text-xs bg-secondary overflow-x-auto whitespace-pre-wrap">
              {group.args}
            </pre>
          </div>
          {group.result !== undefined && (
            <div className="border-t border-border">
              <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground">
                Output
              </div>
              <pre
                className={`px-3 pb-2 text-xs overflow-x-auto whitespace-pre-wrap ${
                  group.status === "error"
                    ? "bg-red-50 dark:bg-red-950/30"
                    : "bg-secondary"
                }`}
              >
                {visibleResult}
              </pre>
              {clamped && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="block w-full px-3 py-1 text-xs text-muted-foreground hover:bg-secondary"
                >
                  Show more
                </button>
              )}
            </div>
          )}
        </div>
      </details>
    );
  },
  (prevProps, nextProps) => {
    const p = prevProps.group;
    const n = nextProps.group;
    return (
      p.id === n.id &&
      p.name === n.name &&
      p.status === n.status &&
      p.result === n.result &&
      p.startedAt === n.startedAt &&
      p.finishedAt === n.finishedAt &&
      p.summary === n.summary &&
      p.args === n.args
    );
  },
);

ToolCallGroup.displayName = "ToolCallGroup";
