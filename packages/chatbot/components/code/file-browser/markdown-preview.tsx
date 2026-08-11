"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";
import { MessageSquare } from "lucide-react";
import { marked } from "marked";
import type { ThemedToken } from "shiki";
import { CodingAgentMarkdownAnchor } from "../coding-agent-markdown-anchor";
import { CodeViewLine } from "./code-view-line";
import type { LineRange } from "./types";
import { Response } from "@/components/chat/response";
import {
  DARK_THEME,
  LIGHT_THEME,
  tokenize,
} from "@/lib/features/code/file-browser/highlight";
import { cn } from "@/lib/utils/helpers";

const FENCE = /^\s*(?:```|~~~)/;

/** Shared empty map, so an unhighlighted render keeps a stable identity. */
const NO_TOKENS: Map<number, ThemedToken[]> = new Map();

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
  /** The fence's declared language, if any. */
  lang: string | null;
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
        // An info string can carry more than the language ("ts twoslash"),
        // and Shiki only understands the language itself.
        lang:
          token.type === "code"
            ? (token.lang?.trim().split(/\s+/)[0] ?? null) || null
            : null,
      },
    ];
  });
}

/**
 * Highlights each fenced block with its own declared language. The whole-file
 * tokens the raw view computes use the Markdown grammar, which leaves fence
 * bodies uncoloured, so code blocks are re-tokenized here.
 */
function useCodeBlockTokens(
  blocks: MarkdownBlock[],
  sourceLines: string[],
): Map<number, ThemedToken[]> {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME;
  const [tokens, setTokens] = useState(NO_TOKENS);

  useEffect(() => {
    const codeBlocks = blocks.flatMap((block) =>
      block.codeRange ? [{ range: block.codeRange, lang: block.lang }] : [],
    );
    if (codeBlocks.length === 0) {
      setTokens(NO_TOKENS);
      return;
    }

    let cancelled = false;
    Promise.all(
      codeBlocks.map(async ({ range, lang }) => {
        const code = sourceLines.slice(range.start - 1, range.end).join("\n");
        const lines = await tokenize(code, lang ?? "plaintext", theme);
        return lines.map(
          (lineTokens, offset): [number, ThemedToken[]] => [
            range.start + offset,
            lineTokens,
          ],
        );
      }),
    )
      .then((results) => {
        if (!cancelled) setTokens(new Map(results.flat()));
      })
      .catch(() => {
        // Highlighting is decorative: the plain source lines still render.
      });

    return () => {
      cancelled = true;
    };
  }, [blocks, sourceLines, theme]);

  return tokens;
}

interface LineComments {
  /** Source line the surrounding block starts on. */
  blockLine: number;
  commentsByLine: Map<number, unknown>;
  selectedLine: number | null;
  onSelectLine: (line: number) => void;
}

/**
 * Streamdown memoizes its built-in elements on className and mdast position
 * only — a comparator that ignores `children` — so an override that closed
 * over the selection would never see it change. Context crosses that memo
 * barrier; prop drilling does not.
 */
const LineCommentsContext = createContext<LineComments | null>(null);

/** Elements that own their click, so selecting a line must not steal it. */
const INTERACTIVE = "a, button, input, textarea, select";

interface MarkdownNodeProps {
  node?: { position?: { start?: { line?: number } } | null } | null;
}

interface LineAnchor {
  line: number;
  className: string;
  props: {
    "data-line-number": number;
    tabIndex: number;
    "aria-label": string;
    onClick: (event: MouseEvent<HTMLElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  };
}

/**
 * Anchors a rendered element to the source line it came from. Both GFM table
 * rows and list items start on exactly one line, so the element's offset
 * within the block is all that's needed.
 */
function useLineAnchor(node: MarkdownNodeProps["node"]): LineAnchor | null {
  const comments = useContext(LineCommentsContext);
  const offset = node?.position?.start?.line;
  if (!comments || offset === undefined) return null;

  const line = comments.blockLine + offset - 1;
  const select = () => comments.onSelectLine(line);

  return {
    line,
    className: cn(
      "cursor-pointer hover:bg-zinc-100/80 dark:hover:bg-zinc-800/70",
      comments.commentsByLine.has(line) && "bg-amber-500/10",
      comments.selectedLine === line && "bg-blue-500/10",
    ),
    props: {
      "data-line-number": line,
      tabIndex: 0,
      "aria-label": `Comment on line ${line}`,
      onClick: (event) => {
        if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
        // Without this the enclosing block would select its own first line,
        // and a nested list item would select its parent's.
        event.stopPropagation();
        select();
      },
      onKeyDown: (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        select();
      },
    },
  };
}

const CommentableTableRow: React.FC<
  ComponentPropsWithoutRef<"tr"> & MarkdownNodeProps
> = ({ children, className, node, ...rest }) => {
  const anchor = useLineAnchor(node);
  const base = cn("border-border border-b", className);

  return (
    <tr className={cn(base, anchor?.className)} {...anchor?.props} {...rest}>
      {children}
    </tr>
  );
};

const CommentableListItem: React.FC<
  ComponentPropsWithoutRef<"li"> & MarkdownNodeProps
> = ({ children, className, node, ...rest }) => {
  const anchor = useLineAnchor(node);
  const base = cn("py-1 [&>p]:inline", className);

  return (
    <li className={cn(base, anchor?.className)} {...anchor?.props} {...rest}>
      {children}
    </li>
  );
};

const MARKDOWN_COMPONENTS = {
  a: CodingAgentMarkdownAnchor,
  tr: CommentableTableRow,
  li: CommentableListItem,
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
  const codeTokens = useCodeBlockTokens(blocks, sourceLines);

  // Per-fence highlighting when it has resolved, the raw view's whole-file
  // tokens until then, and the plain source line if neither is available.
  const tokensFor = (line: number): ThemedToken[] => {
    const highlighted = codeTokens.get(line) ?? tokensByLine?.get(line);
    if (highlighted && highlighted.length > 0) return highlighted;
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
            <LineCommentsContext.Provider
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
            </LineCommentsContext.Provider>
            {composerLine !== null && renderComposer(composerLine)}
          </div>
        );
      })}
    </div>
  );
};
