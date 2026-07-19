import { EventType, type BaseEvent } from "@ag-ui/client";
import { isSafeRelativePath } from "./file-browser/file-links";
import type { GitChangeStatus } from "@/components/code/file-browser/types";

/** Mirrors FILES_CHANGED_EVENT emitted by the worker (see session-manager). */
export const FILES_CHANGED_EVENT = "coding_agent_files_changed";

export interface TurnChangedFile {
  /** POSIX path relative to the project root. */
  path: string;
  status: GitChangeStatus;
}

/** Files-changed blocks anchored to the assistant message that closed a turn. */
export type TurnFilesMap = ReadonlyMap<string, TurnChangedFile[]>;

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "modified",
  "added",
  "deleted",
  "renamed",
  "untracked",
]);

/**
 * Extract and validate the changed-file list from a worker CUSTOM event.
 * Returns null for any other event; invalid entries are dropped.
 */
export function filesChangedFromEvent(event: BaseEvent): TurnChangedFile[] | null {
  if (
    event.type !== EventType.CUSTOM ||
    (event as { name?: string }).name !== FILES_CHANGED_EVENT
  ) {
    return null;
  }
  const value = (event as { value?: unknown }).value;
  if (!value || typeof value !== "object") return null;
  const files = (value as { files?: unknown }).files;
  if (!Array.isArray(files)) return null;
  const result: TurnChangedFile[] = [];
  for (const file of files) {
    if (!file || typeof file !== "object") continue;
    const { path, status } = file as { path?: unknown; status?: unknown };
    if (typeof path !== "string" || !isSafeRelativePath(path)) continue;
    result.push({
      path,
      status:
        typeof status === "string" && VALID_STATUSES.has(status)
          ? (status as GitChangeStatus)
          : "modified",
    });
  }
  return result;
}

interface StoredTurnFiles {
  messageId: string;
  files: TurnChangedFile[];
}

const MAX_STORED_TURNS = 50;

function storageKey(sessionId: string): string {
  return `coding-agent:turn-files:${sessionId}`;
}

/**
 * The worker's in-memory event log doesn't survive reconnect-after-restart
 * and Pi history has no custom events, so received blocks are mirrored to
 * localStorage to keep them across page reloads.
 */
export function loadTurnFiles(sessionId: string): Map<string, TurnChangedFile[]> {
  const result = new Map<string, TurnChangedFile[]>();
  if (typeof window === "undefined") return result;
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) return result;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return result;
    for (const entry of parsed) {
      const { messageId, files } = (entry ?? {}) as StoredTurnFiles;
      if (typeof messageId === "string" && Array.isArray(files)) {
        result.set(messageId, files);
      }
    }
  } catch {
    // Corrupt storage: start over with an empty map.
  }
  return result;
}

export function persistTurnFiles(
  sessionId: string,
  turnFiles: TurnFilesMap,
): void {
  if (typeof window === "undefined") return;
  try {
    const entries: StoredTurnFiles[] = [...turnFiles.entries()]
      .slice(-MAX_STORED_TURNS)
      .map(([messageId, files]) => ({ messageId, files }));
    window.localStorage.setItem(storageKey(sessionId), JSON.stringify(entries));
  } catch {
    // Storage full or unavailable: blocks just won't survive a refresh.
  }
}
