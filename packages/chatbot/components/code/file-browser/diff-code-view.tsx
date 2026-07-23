"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { CodeViewFrame, type LoadState } from "./code-view-frame";
import { useFileBrowser } from "./file-browser-provider";
import type { DiffLineKind, FileDiff } from "./types";
import { fetchFile } from "@/lib/features/code/file-browser/file-browser-fetchers";
import {
  DARK_THEME,
  LIGHT_THEME,
  languageFromPath,
  tokenize,
} from "@/lib/features/code/file-browser/highlight";

export interface DiffCodeViewProps {
  path: string;
  diff: FileDiff;
  onBack: () => void;
}

interface SourceLine {
  kind: DiffLineKind;
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  navigationIndex: number | null;
}

export const DiffCodeView: React.FC<DiffCodeViewProps> = ({
  path,
  diff,
  onBack,
}) => {
  const { project } = useFileBrowser();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME;

  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  const { sourceLines, navigationCount } = useMemo(() => {
    const lines: SourceLine[] = [];
    let inChange = false;
    let navigationIndex = 0;
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.kind === "context") {
          inChange = false;
          lines.push({ ...line, navigationIndex: null });
        } else if (!inChange) {
          lines.push({ ...line, navigationIndex: navigationIndex++ });
          inChange = true;
        } else {
          lines.push({ ...line, navigationIndex: null });
        }
      }
    }
    return { sourceLines: lines, navigationCount: navigationIndex };
  }, [diff]);

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });

    if (sourceLines.length === 0) {
      setLoad({ status: "ready", lines: [] });
      return;
    }

    const sourceContentPromise = /\.(?:md|markdown)$/i.test(path)
      ? fetchFile(project, path)
          .then((result) =>
            result.kind === "file" ? result.content : undefined,
          )
          .catch(() => undefined)
      : Promise.resolve(undefined);

    Promise.all([
      tokenize(
        sourceLines.map((line) => line.content).join("\n"),
        languageFromPath(path),
        theme,
      ),
      sourceContentPromise,
    ])
      .then(([tokens, sourceContent]) => {
        if (cancelled) return;
        setLoad({
          status: "ready",
          sourceContent,
          lines: sourceLines.map((line, index) => ({
            id: `${index}`,
            content: line.content,
            tokens: tokens[index] ?? [],
            oldLineNumber: line.oldLineNumber,
            newLineNumber: line.newLineNumber,
            changeKind: line.kind,
            navigationIndex: line.navigationIndex,
          })),
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setLoad({ status: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [sourceLines, path, project, theme]);

  const selectorForIndex = useCallback(
    (i: number) => `[data-change-index="${i}"]`,
    [],
  );

  return (
    <CodeViewFrame
      path={path}
      load={load}
      navigationCount={navigationCount}
      selectorForIndex={selectorForIndex}
      onBack={onBack}
    />
  );
};
