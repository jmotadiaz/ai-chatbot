"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Code2,
  ChevronDown,
  ChevronUp,
  Eye,
  FileQuestion,
  FileX,
  Trash2,
  X,
} from "lucide-react";
import type { ThemedToken } from "shiki";
import { CodeViewLine } from "./code-view-line";
import { FileBrowserEmptyState } from "./empty-states";
import { useFileBrowser } from "./file-browser-provider";
import { MarkdownPreview } from "./markdown-preview";
import type { DiffLineKind, PendingComment } from "./types";
import { cn } from "@/lib/utils/helpers";
import { Button } from "@/components/ui/button";

export type DisplayLine = {
  id: string;
  content: string;
  tokens: ThemedToken[];
  oldLineNumber: number | null;
  newLineNumber: number | null;
  changeKind: DiffLineKind | "unchanged";
  navigationIndex: number | null;
};

export type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "binary" }
  | { status: "tooLarge" }
  | { status: "ready"; lines: DisplayLine[]; sourceContent?: string };

type ViewMode = "raw" | "rendered";

function isMarkdownPath(path: string): boolean {
  return /\.(?:md|markdown)$/i.test(path);
}

interface CommentComposerProps {
  lineNumber: number;
  existing?: PendingComment;
  onSave: (text: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}

const CommentComposer: React.FC<CommentComposerProps> = ({
  lineNumber,
  existing,
  onSave,
  onRemove,
  onCancel,
}) => {
  const [text, setText] = useState(existing?.text ?? "");
  return (
    <div
      className="sticky left-0 w-full max-w-[100dvw] border-y border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-3"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
        Comment on line {lineNumber}
      </p>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
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

export interface CodeViewFrameProps {
  path: string;
  load: LoadState;
  navigationCount: number;
  selectorForIndex: (index: number) => string | null;
  onBack: () => void;
}

export const CodeViewFrame: React.FC<CodeViewFrameProps> = ({
  path,
  load,
  navigationCount,
  selectorForIndex,
  onBack,
}) => {
  const { state, actions } = useFileBrowser();

  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(
    isMarkdownPath(path) ? "rendered" : "raw",
  );
  const [currentRangeIndex, setCurrentRangeIndex] = useState<number | null>(
    null,
  );
  const codeContainerRef = useRef<HTMLDivElement>(null);

  const scrollToRange = (index: number) => {
    const container = codeContainerRef.current;
    if (!container) return;
    const selector = selectorForIndex(index);
    if (!selector) return;
    const lineEl = container.querySelector(selector);
    if (lineEl) {
      lineEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setCurrentRangeIndex(index);
  };

  const goToNextDiff = () => {
    const nextIndex = currentRangeIndex === null ? 0 : currentRangeIndex + 1;
    if (nextIndex < navigationCount) scrollToRange(nextIndex);
  };

  const goToPrevDiff = () => {
    if (navigationCount === 0) return;
    const prevIndex =
      currentRangeIndex === null || currentRangeIndex <= 0
        ? 0
        : currentRangeIndex - 1;
    scrollToRange(prevIndex);
  };

  const commentsByLine = useMemo(() => {
    const map = new Map<number, PendingComment>();
    for (const comment of state.pendingComments) {
      if (comment.file === path) map.set(comment.startLine, comment);
    }
    return map;
  }, [state.pendingComments, path]);

  const existingComment =
    selectedLine !== null ? commentsByLine.get(selectedLine) : undefined;

  const saveComment = (text: string) => {
    if (selectedLine === null || load.status !== "ready") return;
    const sourceLine = load.sourceContent?.split("\n")[selectedLine - 1];
    actions.upsertComment({
      id: existingComment?.id ?? crypto.randomUUID(),
      file: path,
      startLine: selectedLine,
      endLine: selectedLine,
      lineText:
        sourceLine ??
        load.lines.find((line) => line.newLineNumber === selectedLine)
          ?.content ??
        "",
      text,
      createdAt: existingComment?.createdAt ?? Date.now(),
    });
    setSelectedLine(null);
  };

  const handleSelectLine = useCallback(
    (line: number) =>
      setSelectedLine((current) => (current === line ? null : line)),
    [],
  );

  const canRenderMarkdown =
    load.status === "ready" &&
    isMarkdownPath(path) &&
    load.sourceContent !== undefined;

  // In tree scope the breadcrumbs already show the filename and provide the way
  // back (tap a folder crumb), so the primary bar only appears when there's diff
  // navigation to show. In diff scope there are no breadcrumbs, so the primary
  // bar always shows the filename, diff navigation and a close button.
  const isTree = state.scope === "tree";
  const showDiffNav =
    load.status === "ready" && viewMode === "raw" && navigationCount > 0;
  const showPrimaryBar = !isTree || showDiffNav;

  const renderCommentComposer = (lineNumber: number) => {
    const comment = commentsByLine.get(lineNumber);
    return (
      <CommentComposer
        lineNumber={lineNumber}
        existing={comment}
        onSave={saveComment}
        onRemove={() => {
          if (comment) actions.removeComment(comment.id);
          setSelectedLine(null);
        }}
        onCancel={() => setSelectedLine(null)}
      />
    );
  };

  return (
    <div className="flex h-full flex-col">
      {showPrimaryBar && (
        <header className="flex min-h-12 shrink-0 items-center gap-1 overflow-hidden border-b border-zinc-200 px-2 dark:border-zinc-800">
          {isTree ? (
            <div className="flex-1" />
          ) : (
            <span
              className="min-w-0 flex-1 truncate px-1.5 text-sm font-medium"
              title={path}
            >
              {path.split("/").pop()}
            </span>
          )}
          {showDiffNav && (
            <div className="flex shrink-0 items-center">
              <span className="mr-1 whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                {currentRangeIndex !== null ? currentRangeIndex + 1 : 0} /{" "}
                {navigationCount}
              </span>
              <div className="flex -space-x-1">
                <Button
                  variant="icon"
                  size="icon"
                  type="button"
                  aria-label="Previous diff"
                  disabled={currentRangeIndex === null || currentRangeIndex <= 0}
                  onClick={goToPrevDiff}
                >
                  <ChevronUp size={16} />
                </Button>
                <Button
                  variant="icon"
                  size="icon"
                  type="button"
                  aria-label="Next diff"
                  disabled={
                    currentRangeIndex !== null &&
                    currentRangeIndex >= navigationCount - 1
                  }
                  onClick={goToNextDiff}
                >
                  <ChevronDown size={16} />
                </Button>
              </div>
            </div>
          )}
          {!isTree && (
            <Button
              variant="icon"
              size="icon"
              type="button"
              aria-label="Close file"
              onClick={onBack}
              className="ml-1 shrink-0"
            >
              <X size={20} />
            </Button>
          )}
        </header>
      )}

      {/* The body is a positioning context so the markdown Raw/Preview toggle
          can float over the content (transparent, no solid bar) at the
          top-right, in the same spot for both the diff and file views. */}
      <div className="relative flex-1 overflow-hidden">
        {canRenderMarkdown && (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
            <Button
              variant={viewMode === "raw" ? "secondary" : "icon"}
              size="icon"
              type="button"
              aria-label="Raw"
              aria-pressed={viewMode === "raw"}
              onClick={() => {
                setSelectedLine(null);
                setViewMode("raw");
              }}
            >
              <Code2 size={16} />
            </Button>
            <Button
              variant={viewMode === "rendered" ? "secondary" : "icon"}
              size="icon"
              type="button"
              aria-label="Preview"
              aria-pressed={viewMode === "rendered"}
              onClick={() => {
                setSelectedLine(null);
                setViewMode("rendered");
              }}
            >
              <Eye size={16} />
            </Button>
          </div>
        )}

        {load.status === "loading" && (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            Loading…
          </div>
        )}
        {load.status === "error" && (
          <FileBrowserEmptyState
            Icon={FileX}
            title="Could not open file"
            description={load.message}
          />
        )}
        {load.status === "binary" && (
          <FileBrowserEmptyState
            Icon={FileQuestion}
            title="Binary file"
            description="This file can't be shown here."
          />
        )}
        {load.status === "tooLarge" && (
          <FileBrowserEmptyState
            Icon={FileX}
            title="File too large"
            description="Files over 1 MB can't be shown here."
          />
        )}

        {load.status === "ready" && (
        <div
          ref={codeContainerRef}
          className={cn("h-full overflow-auto overscroll-contain py-2")}
        >
          {canRenderMarkdown && viewMode === "rendered" ? (
            <MarkdownPreview
              content={load.sourceContent ?? ""}
              commentsByLine={commentsByLine}
              selectedLine={selectedLine}
              onSelectLine={handleSelectLine}
              renderComposer={renderCommentComposer}
            />
          ) : (
            load.lines.map((line) => {
              const lineNumber = line.newLineNumber;
              return (
                <div
                  key={line.id}
                  data-line-number={lineNumber ?? undefined}
                  data-change-index={line.navigationIndex ?? undefined}
                >
                  <CodeViewLine
                    oldLineNumber={line.oldLineNumber}
                    newLineNumber={line.newLineNumber}
                    tokens={line.tokens}
                    changeKind={line.changeKind}
                    hasComment={
                      lineNumber !== null && commentsByLine.has(lineNumber)
                    }
                    isSelected={selectedLine === lineNumber}
                    onSelect={handleSelectLine}
                  />
                  {lineNumber !== null &&
                    selectedLine === lineNumber &&
                    renderCommentComposer(lineNumber)}
                </div>
              );
            })
          )}
        </div>
        )}
      </div>
    </div>
  );
};
