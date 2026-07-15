"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, FolderOpen, GitBranch, ListX, X } from "lucide-react";
import { Breadcrumbs } from "./breadcrumbs";
import { CodeView } from "./code-view";
import { FileBrowserEmptyState } from "./empty-states";
import { FileList } from "./file-list";
import { FileListItem } from "./file-list-item";
import { useFileBrowser } from "./file-browser-provider";
import { ScopeTabs } from "./scope-tabs";
import type {
  ChangedFileMeta,
  ChangesResult,
  FileEntry,
} from "./types";
import type { AgentItem } from "@/lib/features/code/types";
import { lastTurnChangedFiles } from "@/lib/features/code/last-turn-changes";
import {
  fetchChanges,
  fetchDir,
} from "@/lib/features/code/file-browser-fetchers";
import { Button } from "@/components/ui/button";

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
        disabled={file.status === "deleted"}
        onSelect={() => onOpen(file.path)}
      />
    ))}
  </FileList>
);

export interface FileBrowserOverlayProps {
  items: AgentItem[];
}

export const FileBrowserOverlay: React.FC<FileBrowserOverlayProps> = ({
  items,
}) => {
  const { state, actions, project } = useFileBrowser();

  const [changes, setChanges] = useState<ChangesResult | null>(null);
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // Fresh git state on every open.
  useEffect(() => {
    if (!state.isOpen) return;
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
  }, [state.isOpen, project]);

  const dirPath = state.pathStack.join("/");
  useEffect(() => {
    if (!state.isOpen || state.scope !== "tree") return;
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
  }, [state.isOpen, state.scope, dirPath, project]);

  const changesByPath = useMemo(
    () => new Map((changes?.files ?? []).map((f) => [f.path, f])),
    [changes],
  );

  const lastTurnFiles = useMemo(
    () =>
      lastTurnChangedFiles(items).map(
        (file) => changesByPath.get(file.path) ?? file,
      ),
    [items, changesByPath],
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
          <div className="py-16 text-center text-sm text-zinc-400">Loading…</div>
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

    if (state.scope === "uncommitted") {
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
    }

    // last-turn
    if (lastTurnFiles.length === 0) {
      return (
        <FileBrowserEmptyState
          Icon={CheckCircle2}
          title="No files changed in the last turn"
          description="Files the agent writes or edits will show up here."
        />
      );
    }
    return (
      <ChangedFileList
        files={lastTurnFiles}
        commentCounts={commentCounts}
        onOpen={actions.openFile}
      />
    );
  };

  return (
    <AnimatePresence>
      {state.isOpen && (
        <motion.div
          data-testid="file-browser-overlay"
          className="fixed inset-0 z-30 flex flex-col bg-(--background)"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 p-2">
            <ScopeTabs
              scope={state.scope}
              onScopeChange={actions.setScope}
              disabledScopes={isGitRepo ? [] : ["uncommitted"]}
              disabledReason="This project is not a git repository"
            />
            <Button
              variant="icon"
              size="icon"
              type="button"
              aria-label="Close file browser"
              onClick={actions.close}
            >
              <X size={20} />
            </Button>
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
                  onBack={actions.closeFile}
                />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
