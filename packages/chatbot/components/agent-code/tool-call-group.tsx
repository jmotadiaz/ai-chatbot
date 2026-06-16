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
  type LucideIcon,
} from "lucide-react";
import type { ToolCallGroup as Group } from "@/lib/features/agent-code/types";

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

function fmtDuration(start: number, end?: number): string {
  if (!end) return "";
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

export interface ToolCallGroupProps {
  group: Group;
}

export const ToolCallGroup = React.memo<ToolCallGroupProps>(({ group }) => {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[group.name.toLowerCase()] ?? Wrench;
  const displayName = TOOL_DISPLAY_NAMES[group.name.toLowerCase()] ?? group.name;
  const lines = (group.result ?? "").split("\n");
  const clamped = lines.length > MAX_LINES && !expanded;
  const visibleResult = clamped ? lines.slice(0, MAX_LINES).join("\n") : group.result ?? "";

  return (
    <div
      data-testid="tool-call-group"
      data-tool={group.name}
      data-status={group.status}
      className="my-2 rounded-md border border-border bg-card overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
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
        {group.finishedAt && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {fmtDuration(group.startedAt, group.finishedAt)}
          </span>
        )}
      </div>
      <details className="border-t border-border">
        <summary className="px-3 py-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          Args
        </summary>
        <pre className="px-3 py-2 text-xs bg-secondary overflow-x-auto whitespace-pre-wrap">
          {group.args}
        </pre>
      </details>
      {group.result !== undefined && (
        <details className="border-t border-border">
          <summary className="px-3 py-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            Output
          </summary>
          <pre
            className={`px-3 py-2 text-xs overflow-x-auto whitespace-pre-wrap ${
              group.status === "error" ? "bg-red-50 dark:bg-red-950/30" : "bg-secondary"
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
        </details>
      )}
    </div>
  );
});

ToolCallGroup.displayName = "ToolCallGroup";
