"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { CodeViewFrame, type LoadState } from "./code-view-frame";
import { useFileBrowser } from "./file-browser-provider";
import type { LineRange } from "./types";
import { fetchFile } from "@/lib/features/code/file-browser/file-browser-fetchers";
import { DARK_THEME, LIGHT_THEME, tokenize } from "@/lib/features/code/file-browser/highlight";

export interface FileCodeViewProps {
  path: string;
  changedRanges: LineRange[];
  onBack: () => void;
}

export const FileCodeView: React.FC<FileCodeViewProps> = ({
  path,
  changedRanges,
  onBack,
}) => {
  const { project } = useFileBrowser();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME;

  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });

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
        if (cancelled) return;
        const contentLines = result.content.split("\n");
        setLoad({
          status: "ready",
          sourceContent: result.content,
          lines: lines.map((tokens, index) => ({
            id: `${index + 1}`,
            content: contentLines[index] ?? "",
            tokens,
            oldLineNumber: null,
            newLineNumber: index + 1,
            changeKind: "unchanged",
            navigationIndex: null,
          })),
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setLoad({ status: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [project, path, theme]);

  const navigationCount = changedRanges.length;
  const selectorForIndex = useCallback(
    (i: number) => {
      const range = changedRanges[i];
      return range ? `[data-line-number="${range.start}"]` : null;
    },
    [changedRanges],
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
