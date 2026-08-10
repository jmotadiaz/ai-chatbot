"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { MessageSquare } from "lucide-react";
import { marked } from "marked";
import type { ThemedToken } from "shiki";
import { CodingAgentMarkdownAnchor } from "../coding-agent-markdown-anchor";
import { CodeViewLine } from "./code-view-line";
import type { LineRange } from "./types";
import { Response } from "@/components/chat/response";
import { cn } from "@/lib/utils/helpers";

const FENCE = /^\s*(?:```|~~~)/;

export type MarkdownBlockKind = "code" | "table" | "other";

interface MarkdownBlock {
  content: string;
  /** First source line of the block, 1-indexed. */
  lineNumber: number;
  /** Last source line of the block, 1-indexed and inclusive. */
  endLine: number;
  kind: MarkdownBlockKind;
  /** For code blocks, the range of the code itself with the fences excluded. */
  codeRange: LineRange | null;
}

/**
 * Source range of a code block's content. Fenced blocks skip the opening fence
 * (and the closing one, which an unterminated block at EOF does not have);
 * indented blocks are code from their first line.
 */
function codeRange(lineNumber: number, rawLines: string[]): LineRange {
  if (!FENCE.test(rawLines[0] ?? "")) {
    return { start: lineNumber, end: lineNumber + rawLines.length - 1 };
  }
  const isClosed =
    rawLines.length > 1 && FENCE.test(rawLines[rawLines.length - 1] ?? "");
  return {
    start: lineNumber + 1,
    end: lineNumber + rawLines.length - 1 - (isClosed ? 1 : 0),
  };
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

    const rawLines = token.raw.replace(/\n+$/, "").split("\n");
    const kind: MarkdownBlockKind =
      token.type === "code"
        ? "code"
        : token.type === "table"
          ? "table"
          : "other";

    return [
      {
        content: token.raw,
        lineNumber,
        endLine: lineNumber + rawLines.length - 1,
        kind,
        codeRange: kind === "code" ? codeRange(lineNumber, rawLines) : null,
      },
    ];
  });
}

interface TableRowComments {
  /** Source line the surrounding block starts on. */
  blockLine: number;
  commentsByLine: Map<number, unknown>;
  selectedLine: number | null;
  onSelectLine: (line: number) => void;
}

/**
 * Streamdown memoizes its built-in `thead`/`tbody`/`tr` on className and mdast
 * position only — a comparator that ignores `children` — so a `tr` override
 * that closed over the selection would never see it change. Context crosses
 * that memo barrier; prop drilling does not.
 */
const TableRowCommentsContext = createContext<TableRowComments | null>(null);

type MarkdownRowProps = ComponentPropsWithoutRef<"tr"> & {
  node?: { position?: { start?: { line?: number } } | null } | null;
};

/**
 * A GFM table row is always exactly one source line, so the row's offset within
 * the block is all that's needed to anchor a comment to its real file line.
 */
const CommentableTableRow: React.FC<MarkdownRowProps> = ({
  children,
  className,
  node,
  ...rest
}) => {
  const comments = useContext(TableRowCommentsContext);
  const offset = node?.position?.start?.line;
  const rowClassName = cn("border-border border-b", className);

  if (!comments || offset === undefined) {
    return (
      <tr className={rowClassName} {...rest}>
        {children}
      </tr>
    );
  }

  const line = comments.blockLine + offset - 1;
  const hasComment = comments.commentsByLine.has(line);
  const isSelected = comments.selectedLine === line;
  const select = () => comments.onSelectLine(line);

  return (
    <tr
      data-line-number={line}
      tabIndex={0}
      aria-label={`Comment on line ${line}`}
      className={cn(
        rowClassName,
        "cursor-pointer hover:bg-zinc-100/80 dark:hover:bg-zinc-800/70",
        hasComment && "bg-amber-500/10",
        isSelected && "bg-blue-500/10",
      )}
      onClick={(event) => {
        event.stopPropagation();
        select();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        select();
      }}
      {...rest}
    >
      {children}
    </tr>
  );
};

const MARKDOWN_COMPONENTS = {
  a: CodingAgentMarkdownAnchor,
  tr: CommentableTableRow,
};

export interface MarkdownPreviewProps {
  content: string;
  commentsByLine: Map<number, unknown>;
  selectedLine: number | null;
  onSelectLine: (line: number) => void;
  renderComposer: (line: number) => ReactNode;
  /** Shiki tokens per source line, so code blocks match the raw view. */
  tokensByLine?: Map<number, ThemedToken[]>;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  commentsByLine,
  selectedLine,
  onSelectLine,
  renderComposer,
  tokensByLine,
}) => {
  const blocks = useMemo(() => markdownBlocks(content), [content]);
  const sourceLines = useMemo(() => content.split("\n"), [content]);

  const tokensFor = (line: number): ThemedToken[] => {
    const tokens = tokensByLine?.get(line);
    if (tokens && tokens.length > 0) return tokens;
    const text = sourceLines[line - 1] ?? "";
    return text ? [{ content: text, offset: 0 } as ThemedToken] : [];
  };

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
        const key = `${block.lineNumber}-${index}`;

        // Code blocks reuse the raw view's line rows, so a fenced block reads
        // and comments exactly like the same lines do in the raw view.
        if (block.kind === "code" && block.codeRange) {
          const { start, end } = block.codeRange;
          const lineNumbers = Array.from(
            { length: Math.max(end - start + 1, 0) },
            (_, offset) => start + offset,
          );

          return (
            <div
              key={key}
              data-line-number={block.lineNumber}
              className="-mx-3 overflow-x-auto rounded-md border border-zinc-200 py-1 dark:border-zinc-800"
            >
              {lineNumbers.map((line) => (
                <div key={line} data-line-number={line}>
                  <CodeViewLine
                    oldLineNumber={null}
                    newLineNumber={line}
                    tokens={tokensFor(line)}
                    changeKind="unchanged"
                    hasComment={commentsByLine.has(line)}
                    isSelected={selectedLine === line}
                    onSelect={onSelectLine}
                  />
                  {selectedLine === line && renderComposer(line)}
                </div>
              ))}
            </div>
          );
        }

        const hasComment = commentsByLine.has(block.lineNumber);
        const isSelected = selectedLine === block.lineNumber;
        // A table row's composer cannot live inside `<tbody>`, so any selection
        // landing within the block renders it just below the block instead.
        const composerLine =
          selectedLine !== null &&
          selectedLine >= block.lineNumber &&
          selectedLine <= block.endLine
            ? selectedLine
            : null;

        return (
          <div
            key={key}
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
            <TableRowCommentsContext.Provider
              value={{
                blockLine: block.lineNumber,
                commentsByLine,
                selectedLine,
                onSelectLine,
              }}
            >
              <Response
                className="h-auto [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                components={MARKDOWN_COMPONENTS}
              >
                {block.content}
              </Response>
            </TableRowCommentsContext.Provider>
            {composerLine !== null && renderComposer(composerLine)}
          </div>
        );
      })}
    </div>
  );
};
