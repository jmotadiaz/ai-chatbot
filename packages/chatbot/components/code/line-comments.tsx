"use client";

import {
  Children,
  createContext,
  useContext,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { LineRange } from "./file-browser/types";
import { cn } from "@/lib/utils/helpers";

export type MarkdownBlockKind = "code" | "table" | "list" | "other";

export interface LineComments {
  /** Source line the surrounding block starts on. */
  blockLine: number;
  /** Kind of the surrounding block (lists/tables own their composer inline). */
  blockKind: MarkdownBlockKind;
  commentsByLine: Map<number, unknown>;
  selectedLine: number | null;
  onSelectLine: (line: number) => void;
  renderComposer: (line: number) => ReactNode;
  /** Set for response code fences whose rendered lines are commentable. */
  codeRange?: LineRange | null;
}

/**
 * Streamdown memoizes its built-in elements on className and mdast position
 * only. Context crosses that memo barrier when comment selection changes;
 * prop drilling does not.
 */
export const LineCommentsContext = createContext<LineComments | null>(null);

/** Elements that own their click, so selecting a line must not steal it. */
export const INTERACTIVE = "a, button, input, textarea, select";

export interface MarkdownNodeProps {
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

/** Anchor a rendered list item or table row to its Markdown source line. */
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
        // Do not let an enclosing block or nested list item steal the anchor.
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

/** The line whose composer an li/tr owns inline, if any. */
function inlineComposerLine(
  comments: LineComments | null,
  anchor: LineAnchor | null,
): number | null {
  if (!comments || !anchor || comments.selectedLine !== anchor.line) {
    return null;
  }
  if (comments.blockKind === "other" && anchor.line === comments.blockLine) {
    return null;
  }
  return anchor.line;
}

export const CommentableTableRow: React.FC<
  ComponentPropsWithoutRef<"tr"> & MarkdownNodeProps
> = ({ children, className, node, ...rest }) => {
  const comments = useContext(LineCommentsContext);
  const anchor = useLineAnchor(node);
  const base = cn("border-border border-b", className);
  const inlineLine = inlineComposerLine(comments, anchor);
  const colSpan = Math.max(Children.count(children), 1);

  return (
    <>
      <tr className={cn(base, anchor?.className)} {...anchor?.props} {...rest}>
        {children}
      </tr>
      {inlineLine !== null && comments !== null && (
        <tr
          data-line-composer={inlineLine}
          onClick={(event) => event.stopPropagation()}
        >
          <td colSpan={colSpan} className="border-0 p-0">
            {comments.renderComposer(inlineLine)}
          </td>
        </tr>
      )}
    </>
  );
};

export const CommentableListItem: React.FC<
  ComponentPropsWithoutRef<"li"> & MarkdownNodeProps
> = ({ children, className, node, ...rest }) => {
  const comments = useContext(LineCommentsContext);
  const anchor = useLineAnchor(node);
  const base = cn("py-1 [&>p]:inline", className);
  const inlineLine = inlineComposerLine(comments, anchor);

  return (
    <>
      <li className={cn(base, anchor?.className)} {...anchor?.props} {...rest}>
        {children}
      </li>
      {inlineLine !== null && comments !== null && (
        <li
          data-line-composer={inlineLine}
          className="list-none p-0 [&::marker]:content-none"
          onClick={(event) => event.stopPropagation()}
        >
          {comments.renderComposer(inlineLine)}
        </li>
      )}
    </>
  );
};
