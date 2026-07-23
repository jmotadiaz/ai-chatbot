"use client";

import { useMemo, type KeyboardEvent, type ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { marked } from "marked";
import { CodingAgentMarkdownAnchor } from "../coding-agent-markdown-anchor";
import { Response } from "@/components/chat/response";
import { cn } from "@/lib/utils/helpers";

const MARKDOWN_COMPONENTS = { a: CodingAgentMarkdownAnchor };

interface MarkdownBlock {
  content: string;
  lineNumber: number;
}

export function markdownBlocks(content: string): MarkdownBlock[] {
  const tokens = marked.lexer(content);
  let searchFrom = 0;

  return tokens.flatMap((token) => {
    if (!token.raw.trim()) return [];

    const tokenStart = content.indexOf(token.raw, searchFrom);
    const start = tokenStart === -1 ? searchFrom : tokenStart;
    const lineNumber = content.slice(0, start).split("\n").length;
    searchFrom = start + token.raw.length;

    return [{ content: token.raw, lineNumber }];
  });
}

export interface MarkdownPreviewProps {
  content: string;
  commentsByLine: Map<number, unknown>;
  selectedLine: number | null;
  onSelectLine: (line: number) => void;
  renderComposer: (line: number) => ReactNode;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  commentsByLine,
  selectedLine,
  onSelectLine,
  renderComposer,
}) => {
  const blocks = useMemo(() => markdownBlocks(content), [content]);

  const handleKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    lineNumber: number,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelectLine(lineNumber);
  };

  return (
    <div
      data-testid="markdown-preview"
      className="mx-auto w-full max-w-4xl space-y-4 px-6 py-5"
    >
      {blocks.map((block, index) => {
        const hasComment = commentsByLine.has(block.lineNumber);
        const isSelected = selectedLine === block.lineNumber;

        return (
          <div
            key={`${block.lineNumber}-${index}`}
            data-line-number={block.lineNumber}
            role="button"
            tabIndex={0}
            aria-label={`Comment on Markdown block starting at line ${block.lineNumber}`}
            className={cn(
              "group relative -mx-3 rounded-md border border-transparent px-3 transition-colors",
              "cursor-pointer hover:bg-zinc-100/80 focus-visible:border-zinc-400 focus-visible:outline-none dark:hover:bg-zinc-800/70",
              hasComment &&
                "border-amber-300 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-950/20",
              isSelected &&
                "border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800",
            )}
            onClick={(event) => {
              if (
                (event.target as HTMLElement).closest(
                  "a, button, input, textarea, select",
                )
              ) {
                return;
              }
              onSelectLine(block.lineNumber);
            }}
            onKeyDown={(event) => handleKeyDown(event, block.lineNumber)}
          >
            <span
              className={cn(
                "absolute -left-2 top-2 rounded-full border bg-(--background) p-1 text-zinc-500 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
                hasComment && "text-amber-600 opacity-100 dark:text-amber-400",
              )}
              aria-hidden="true"
            >
              <MessageSquare size={13} />
            </span>
            <Response
              className="h-auto [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              components={MARKDOWN_COMPONENTS}
            >
              {block.content}
            </Response>
            {isSelected && renderComposer(block.lineNumber)}
          </div>
        );
      })}
    </div>
  );
};
