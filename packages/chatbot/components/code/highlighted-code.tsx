"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import type { ThemedToken } from "shiki";
import { DARK_THEME, LIGHT_THEME, tokenize } from "@/lib/features/code/file-browser/highlight";
import { cn } from "@/lib/utils/helpers";

export interface HighlightedCodeProps {
  content: string;
  language: string;
  className?: string;
}

export const HighlightedCode: React.FC<HighlightedCodeProps> = ({ content, language, className }) => {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME;
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);

  useEffect(() => {
    if (!content) {
      setTokens(null);
      return;
    }
    let cancelled = false;
    setTokens(null); // reset to fallback while re-tokenizing (theme/content change)
    tokenize(content, language, theme)
      .then((t) => {
        if (!cancelled) setTokens(t);
      })
      .catch(() => {
        if (!cancelled) setTokens(null);
      });
    return () => {
      cancelled = true;
    };
  }, [content, language, theme]);

  if (!content) {
    return (
      <pre className={cn("p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto text-muted-foreground", className)}>
        (empty)
      </pre>
    );
  }

  if (!tokens) {
    return (
      <pre className={cn("p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto text-muted-foreground", className)}>
        {content}
      </pre>
    );
  }

  return (
    <pre className={cn("p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto", className)}>
      {tokens.map((line, i) => (
        <div key={i} className="leading-5 min-h-[1.25rem]">
          {line.length === 0 ? (
            "\n"
          ) : (
            line.map((tok, j) => (
              <span key={j} style={{ color: tok.color }}>
                {tok.content}
              </span>
            ))
          )}
        </div>
      ))}
    </pre>
  );
};
