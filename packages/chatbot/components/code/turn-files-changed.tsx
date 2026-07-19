"use client";

import * as React from "react";
import Link from "next/link";
import { FileDiff } from "lucide-react";
import { useFileBrowser } from "./file-browser/file-browser-provider";
import type { GitChangeStatus } from "./file-browser/types";
import { diffViewHref } from "@/lib/features/code/file-browser/file-links";
import type { TurnChangedFile } from "@/lib/features/code/turn-files";

const STATUS_CLASSES: Record<GitChangeStatus, string> = {
  modified: "text-amber-600 dark:text-amber-400",
  added: "text-green-600 dark:text-green-400",
  untracked: "text-green-600 dark:text-green-400",
  deleted: "text-red-600 dark:text-red-400",
  renamed: "text-blue-600 dark:text-blue-400",
};

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

export interface TurnFilesChangedProps {
  files: TurnChangedFile[];
}

/**
 * End-of-turn summary of the files the agent touched, built from the
 * worker's git-derived `coding_agent_files_changed` event. Each entry links
 * into the diff view of the file browser.
 */
export const TurnFilesChanged: React.FC<TurnFilesChangedProps> = ({ files }) => {
  const { project, sessionId } = useFileBrowser();

  if (files.length === 0) return null;

  return (
    <div
      data-testid="turn-files-changed"
      className="-mt-6 mb-8 rounded-md border border-border bg-card overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 text-sm border-b border-border">
        <FileDiff className="size-4 text-muted-foreground" />
        <span className="font-medium">Files changed</span>
        <span className="text-muted-foreground">{files.length}</span>
      </div>
      <ul>
        {files.map((file) => (
          <li key={file.path}>
            <Link
              href={diffViewHref(project, sessionId, file.path)}
              className="flex items-baseline gap-2 px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <span className="font-mono truncate">
                {dirname(file.path) && (
                  <span className="text-muted-foreground">
                    {dirname(file.path)}/
                  </span>
                )}
                {basename(file.path)}
              </span>
              <span className={`text-xs ${STATUS_CLASSES[file.status]}`}>
                {file.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};
