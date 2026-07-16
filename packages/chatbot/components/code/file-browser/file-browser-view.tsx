"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FolderOpen, GitBranch, ListX } from "lucide-react";
import { Breadcrumbs } from "./breadcrumbs";
import { CodeView } from "./code-view";
import { FileBrowserEmptyState } from "./empty-states";
import { FileList } from "./file-list";
import { FileListItem } from "./file-list-item";
import { useFileBrowser } from "./file-browser-provider";
import { ScopeTabs } from "./scope-tabs";
import type { ChangedFileMeta, ChangesResult, FileEntry } from "./types";
import {
  fetchChanges,
  fetchDir,
} from "@/lib/features/code/file-browser/file-browser-fetchers";

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

interface ChangedFileListProps {
  files: ChangedFileMeta[];
  commentCounts: Map<string, number>;
  onOpen: (path: string) => void;
}

const ChangedFileList: React.FC<ChangedFileListProps> = ({
  files,
  commentCounts,
  onOpen,
}) => (
  <FileList>
    {files.map((file) => (
      <FileListItem
        key={file.path}
        title={basename(file.path)}
        subtitle={dirname(file.path) || undefined}
        badge={file.status}
        commentCount={commentCounts.get(file.path) ?? 0}
        disabled={file.status === "deleted" && file.diff === null}
        onSelect={() => onOpen(file.path)}
      />
    ))}
  </FileList>
);

export const FileBrowserView: React.FC = () => {
  const { state, actions, project } = useFileBrowser();

  const [changes, setChanges] = useState<ChangesResult | null>(null);
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // Fresh git state on every mount.
  useEffect(() => {
    let cancelled = false;
    setChanges(null);
    fetchChanges(project)
      .then((result) => {
        if (!cancelled) setChanges(result);
      })
      .catch(() => {
        if (!cancelled) setChanges({ isGitRepo: false, files: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

  const dirPath = state.pathStack.join("/");
  useEffect(() => {
    if (state.scope !== "tree") return;
    let cancelled = false;
    setEntries(null);
    setListError(null);
    fetchDir(project, dirPath)
      .then((result) => {
        if (!cancelled) setEntries(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setListError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [state.scope, dirPath, project]);

  const changesByPath = useMemo(
    () => new Map((changes?.files ?? []).map((f) => [f.path, f])),
    [changes],
  );

  const commentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of state.pendingComments) {
      counts.set(comment.file, (counts.get(comment.file) ?? 0) + 1);
    }
    return counts;
  }, [state.pendingComments]);

  const isGitRepo = changes?.isGitRepo ?? true;
  const activeRanges = state.activeFile
    ? (changesByPath.get(state.activeFile)?.changedRanges ?? [])
    : [];
  const activeDiff = state.activeFile
    ? (changesByPath.get(state.activeFile)?.diff ?? null)
    : null;

  const renderList = () => {
    if (state.scope === "tree") {
      if (listError) {
        return (
          <FileBrowserEmptyState
            Icon={ListX}
            title="Could not list files"
            description={listError}
          />
        );
      }
      if (entries === null) {
        return (
          <div className="py-16 text-center text-sm text-zinc-400">
            Loading…
          </div>
        );
      }
      if (entries.length === 0) {
        return <FileBrowserEmptyState Icon={FolderOpen} title="Empty folder" />;
      }
      return (
        <FileList>
          {entries.map((entry) => (
            <FileListItem
              key={entry.path}
              title={entry.name}
              isDir={entry.kind === "dir"}
              badge={changesByPath.get(entry.path)?.status}
              commentCount={commentCounts.get(entry.path) ?? 0}
              onSelect={() =>
                entry.kind === "dir"
                  ? actions.pushPath(entry.name)
                  : actions.openFile(entry.path)
              }
            />
          ))}
        </FileList>
      );
    }

    // uncommitted
    if (changes === null) {
      return (
        <div className="py-16 text-center text-sm text-zinc-400">Loading…</div>
      );
    }
    if (!changes.isGitRepo) {
      return (
        <FileBrowserEmptyState
          Icon={GitBranch}
          title="Not a git repository"
          description="This project has no git history, so uncommitted changes can't be shown."
        />
      );
    }
    if (changes.files.length === 0) {
      return (
        <FileBrowserEmptyState
          Icon={CheckCircle2}
          title="No uncommitted changes"
          description="The working tree is clean."
        />
      );
    }
    return (
      <ChangedFileList
        files={changes.files}
        commentCounts={commentCounts}
        onOpen={actions.openFile}
      />
    );
  };

  return (
    <div
      data-testid="file-browser-view"
      className="flex h-full flex-col bg-(--background)"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 p-2">
        <ScopeTabs
          scope={state.scope}
          onScopeChange={actions.setScope}
          disabledScopes={isGitRepo ? [] : ["uncommitted"]}
          disabledReason="This project is not a git repository"
        />
      </div>

      {state.scope === "tree" && (
        <Breadcrumbs
          rootLabel={project}
          pathStack={state.pathStack}
          onNavigate={actions.truncatePath}
        />
      )}

      <div className="relative flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">{renderList()}</div>
        {state.activeFile && (
          <div className="absolute inset-0 z-10 bg-(--background)">
            <CodeView
              path={state.activeFile}
              changedRanges={activeRanges}
              diff={state.scope === "uncommitted" ? activeDiff : null}
              onBack={actions.closeFile}
            />
          </div>
        )}
      </div>
    </div>
  );
};
