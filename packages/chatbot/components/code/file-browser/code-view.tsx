"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  FileQuestion,
  FileX,
  Trash2,
} from "lucide-react";
import { useTheme } from "next-themes";
import type {
  BundledLanguage,
  BundledTheme,
  Highlighter,
  ThemedToken,
} from "shiki";
import { CodeViewLine } from "./code-view-line";
import { FileBrowserEmptyState } from "./empty-states";
import { useFileBrowser } from "./file-browser-provider";
import type {
  DiffLineKind,
  FileDiff,
  LineRange,
  PendingComment,
} from "./types";
import { fetchFile } from "@/lib/features/code/file-browser/file-browser-fetchers";
import { cn } from "@/lib/utils/helpers";
import { Button } from "@/components/ui/button";

const LIGHT_THEME: BundledTheme = "github-light";
const DARK_THEME: BundledTheme = "github-dark";

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((shiki) =>
      shiki.createHighlighter({ themes: [LIGHT_THEME, DARK_THEME], langs: [] }),
    );
  }
  return highlighterPromise;
}

async function tokenize(
  content: string,
  language: string,
  theme: BundledTheme,
): Promise<ThemedToken[][]> {
  const highlighter = await getHighlighter();
  let lang = language;
  try {
    await highlighter.loadLanguage(lang as BundledLanguage);
  } catch {
    lang = "plaintext";
  }
  return highlighter.codeToTokensBase(content, {
    lang: lang as BundledLanguage,
    theme,
  });
}

function languageFromPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  const languages: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    py: "python",
    sh: "shellscript",
    yml: "yaml",
    yaml: "yaml",
  };
  return (extension && languages[extension]) ?? "plaintext";
}

type DisplayLine = {
  id: string;
  content: string;
  tokens: ThemedToken[];
  oldLineNumber: number | null;
  newLineNumber: number | null;
  changeKind: DiffLineKind | "unchanged";
  navigationIndex: number | null;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "binary" }
  | { status: "tooLarge" }
  | { status: "ready"; lines: DisplayLine[] };

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
    <div className="sticky left-0 w-full max-w-[100dvw] border-y border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-3">
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

export interface CodeViewProps {
  path: string;
  changedRanges: LineRange[];
  diff: FileDiff | null;
  onBack: () => void;
}

export const CodeView: React.FC<CodeViewProps> = ({
  path,
  changedRanges,
  diff,
  onBack,
}) => {
  const { state, actions, project } = useFileBrowser();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME;

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [currentRangeIndex, setCurrentRangeIndex] = useState<number | null>(
    null,
  );
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const diffNavigationTargets = useMemo(() => {
    if (!diff) return [];

    const targets: string[] = [];
    for (const [hunkIndex, hunk] of diff.hunks.entries()) {
      let inChange = false;
      for (const [lineIndex, line] of hunk.lines.entries()) {
        if (line.kind === "context") {
          inChange = false;
        } else if (!inChange) {
          targets.push(`${hunkIndex}-${lineIndex}`);
          inChange = true;
        }
      }
    }
    return targets;
  }, [diff]);
  const diffNavigationIndexes = useMemo(
    () => new Map(diffNavigationTargets.map((id, index) => [id, index])),
    [diffNavigationTargets],
  );
  const navigationCount = diff
    ? diffNavigationTargets.length
    : changedRanges.length;

  const scrollToRange = (index: number) => {
    const container = codeContainerRef.current;
    if (!container) return;
    const range = changedRanges[index];
    const selector = diff
      ? `[data-change-index="${index}"]`
      : range
        ? `[data-line-number="${range.start}"]`
        : null;
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

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    setSelectedLine(null);
    setCurrentRangeIndex(null);

    if (diff) {
      const sourceLines = diff.hunks.flatMap((hunk, hunkIndex) =>
        hunk.lines.map((line, lineIndex) => ({
          ...line,
          id: `${hunkIndex}-${lineIndex}`,
          navigationIndex:
            diffNavigationIndexes.get(`${hunkIndex}-${lineIndex}`) ?? null,
        })),
      );
      if (sourceLines.length === 0) {
        setLoad({ status: "ready", lines: [] });
      } else {
        tokenize(
          sourceLines.map((line) => line.content).join("\n"),
          languageFromPath(path),
          theme,
        )
          .then((tokens) => {
            if (cancelled) return;
            setLoad({
              status: "ready",
              lines: sourceLines.map((line, index) => ({
                ...line,
                tokens: tokens[index] ?? [],
                changeKind: line.kind,
              })),
            });
          })
          .catch((err: Error) => {
            if (!cancelled) setLoad({ status: "error", message: err.message });
          });
      }
      return () => {
        cancelled = true;
      };
    }

    fetchFile(project, path)
      .then(async (result) => {
        if (cancelled) return;
        if (result.kind === "binary") {
          setLoad({ status: "binary" });
          return;
        }
        if (result.kind === "tooLarge") {
          setLoad({ status: "tooLarge" });
          return;
        }
        const lines = await tokenize(result.content, result.language, theme);
        if (!cancelled) {
          setLoad({
            status: "ready",
            lines: lines.map((tokens, index) => ({
              id: `${index + 1}`,
              content: result.content.split("\n")[index] ?? "",
              tokens,
              oldLineNumber: null,
              newLineNumber: index + 1,
              changeKind: "unchanged",
              navigationIndex: null,
            })),
          });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setLoad({ status: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [diff, diffNavigationIndexes, project, path, theme]);

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
    actions.upsertComment({
      id: existingComment?.id ?? crypto.randomUUID(),
      file: path,
      startLine: selectedLine,
      endLine: selectedLine,
      lineText:
        load.lines.find((line) => line.newLineNumber === selectedLine)
          ?.content ?? "",
      text,
      createdAt: existingComment?.createdAt ?? Date.now(),
    });
    setSelectedLine(null);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-12 shrink-0 items-center gap-1 overflow-hidden border-b border-zinc-200 px-2 dark:border-zinc-800">
        <Button
          variant="icon"
          size="icon"
          type="button"
          aria-label="Back to file list"
          onClick={onBack}
        >
          <ChevronLeft size={20} />
        </Button>
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium"
          dir="rtl"
          title={path}
        >
          {path}
        </span>
        {load.status === "ready" && navigationCount > 0 && (
          <div className="ml-4 flex shrink-0 items-center">
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
      </header>

      {load.status === "loading" && (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
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
          className={cn("flex-1 overflow-auto overscroll-contain py-2")}
        >
          {load.lines.map((line) => {
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
                  onSelect={(line) =>
                    setSelectedLine((current) =>
                      current === line ? null : line,
                    )
                  }
                />
                {lineNumber !== null && selectedLine === lineNumber && (
                  <CommentComposer
                    lineNumber={lineNumber}
                    existing={existingComment}
                    onSave={saveComment}
                    onRemove={() => {
                      if (existingComment)
                        actions.removeComment(existingComment.id);
                      setSelectedLine(null);
                    }}
                    onCancel={() => setSelectedLine(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
