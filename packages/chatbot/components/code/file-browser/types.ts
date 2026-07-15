export type FileBrowserScope = "last-turn" | "uncommitted" | "tree";

export type GitChangeStatus = "modified" | "added" | "deleted" | "renamed" | "untracked";

export interface FileEntry {
  name: string;
  path: string; // POSIX relative path from project root
  kind: "dir" | "file";
}

export interface LineRange {
  start: number; // 1-indexed, inclusive
  end: number; // 1-indexed, inclusive
}

export interface ChangedFileMeta {
  path: string; // POSIX relative path from project root
  status: GitChangeStatus;
  /** Changed line ranges in the new version of the file. Empty for untracked/deleted. */
  changedRanges: LineRange[];
}

export type FileContentResult =
  | { kind: "dir"; entries: FileEntry[] }
  | { kind: "file"; content: string; language: string }
  | { kind: "binary" }
  | { kind: "tooLarge"; size: number };

export interface ChangesResult {
  isGitRepo: boolean;
  files: ChangedFileMeta[];
}

export interface FileBrowserState {
  isOpen: boolean;
  scope: FileBrowserScope;
  pathStack: string[]; // breadcrumb segments, [] = project root
  activeFile: string | null; // file open in the code view
  pendingComments: PendingComment[]; // survives closing the overlay and switching scope
}

export interface PendingComment {
  id: string;
  file: string; // POSIX relative path from project root
  startLine: number;
  endLine: number; // v1: single line (startLine === endLine)
  lineText: string; // snapshot of the commented line for context
  text: string;
  createdAt: number;
}
