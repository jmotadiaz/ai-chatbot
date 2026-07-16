"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronUp, FileQuestion, FileX, Trash2 } from "lucide-react";
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
import type { LineRange, PendingComment } from "./types";
import { fetchFile } from "@/lib/features/code/file-browser-fetchers";
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

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "binary" }
  | { status: "tooLarge" }
  | { status: "ready"; lines: ThemedToken[][]; rawLines: string[] };

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
  onBack: () => void;
}

export const CodeView: React.FC<CodeViewProps> = ({
  path,
  changedRanges,
  onBack,
}) => {
  const { state, actions, project } = useFileBrowser();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME;

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [currentRangeIndex, setCurrentRangeIndex] = useState<number | null>(null);
  const codeContainerRef = useRef<HTMLDivElement>(null);

  const scrollToRange = (index: number) => {
    const container = codeContainerRef.current;
    if (!container) return;
    const range = changedRanges[index];
    if (!range) return;
    const lineEl = container.querySelector(
      `[data-line-number="${range.start}"]`,
    );
    if (lineEl) {
      lineEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setCurrentRangeIndex(index);
  };

  const goToNextDiff = () => {
    const nextIndex =
      currentRangeIndex === null ? 0 : currentRangeIndex + 1;
    if (nextIndex < changedRanges.length) scrollToRange(nextIndex);
  };

  const goToPrevDiff = () => {
    if (changedRanges.length === 0) return;
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
            lines,
            rawLines: result.content.split("\n"),
          });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setLoad({ status: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [project, path, theme]);

  const changedLines = useMemo(() => {
    const set = new Set<number>();
    for (const range of changedRanges) {
      for (let line = range.start; line <= range.end; line++) set.add(line);
    }
    return set;
  }, [changedRanges]);

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
      lineText: load.rawLines[selectedLine - 1] ?? "",
      text,
      createdAt: existingComment?.createdAt ?? Date.now(),
    });
    setSelectedLine(null);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-12 shrink-0 items-center gap-1 border-b border-zinc-200 dark:border-zinc-800 px-2">
        <Button
          variant="icon"
          size="icon"
          type="button"
          aria-label="Back to file list"
          onClick={onBack}
        >
          <ChevronLeft size={20} />
        </Button>
        <span className="truncate text-sm font-medium" dir="rtl">
          {path}
        </span>
        {load.status === "ready" && changedRanges.length > 0 && (
          <div className="ml-auto flex items-center gap-0.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
              {currentRangeIndex !== null ? currentRangeIndex + 1 : 0} /{" "}
              {changedRanges.length}
            </span>
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
                currentRangeIndex >= changedRanges.length - 1
              }
              onClick={goToNextDiff}
            >
              <ChevronDown size={16} />
            </Button>
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
          {load.lines.map((tokens, idx) => {
            const lineNumber = idx + 1;
            return (
              <div key={lineNumber} data-line-number={lineNumber}>
                <CodeViewLine
                  lineNumber={lineNumber}
                  tokens={tokens}
                  isChanged={changedLines.has(lineNumber)}
                  hasComment={commentsByLine.has(lineNumber)}
                  isSelected={selectedLine === lineNumber}
                  onSelect={(line) =>
                    setSelectedLine((current) => (current === line ? null : line))
                  }
                />
                {selectedLine === lineNumber && (
                  <CommentComposer
                    lineNumber={lineNumber}
                    existing={existingComment}
                    onSave={saveComment}
                    onRemove={() => {
                      if (existingComment) actions.removeComment(existingComment.id);
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
