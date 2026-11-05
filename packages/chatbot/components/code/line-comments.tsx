"use client";

import {
  Children,
  createContext,
  createElement,
  useContext,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { LineRange } from "./file-browser/types";
import { commentRowClass } from "./comment-styles";
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

/**
 * ATX (`## Title`) and Setext (`Title` underlined with `---`) headings, matched
 * against a block's Markdown source. Both surfaces that render commentable
 * blocks need it to decide how much air a section opens with.
 */
const HEADING_SOURCE = /^\s*(?:#{1,6}\s+|[^\n]+\n\s*[-=]{2,}\s*$)/;

export function isHeadingSource(content: string): boolean {
  return HEADING_SOURCE.test(content);
}

export interface MarkdownNodeProps {
  node?: { position?: { start?: { line?: number } } | null } | null;
}

interface LineAnchor {
  line: number;
  className: string;
  props: {
    "data-line-number": number;
    "data-comment-anchor": "true";
    "data-commented"?: "true";
    "data-selected"?: "true";
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
    className: commentRowClass(
      comments.commentsByLine.has(line),
      comments.selectedLine === line,
    ),
    props: {
      "data-line-number": line,
      "data-comment-anchor": "true",
      "data-commented": comments.commentsByLine.has(line)
        ? "true"
        : undefined,
      "data-selected": comments.selectedLine === line ? "true" : undefined,
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

/** Streamdown hands every component its mdast node; it never reaches the DOM. */
interface MarkdownElementProps extends MarkdownNodeProps {
  className?: string;
  children?: ReactNode;
}

/**
 * Streamdown's headings carry `mt-6 mb-2` to separate sections in a flowing
 * document. Inside a commentable block the wrapper already frames the heading
 * with its own padding, so those margins only push the text away from its
 * comment anchor and inflate the hover box. These keep Streamdown's type scale
 * and drop the margins; the block decides the gap between sections.
 */
const HEADING_SCALES = {
  h1: "text-3xl",
  h2: "text-2xl",
  h3: "text-xl",
  h4: "text-lg",
  h5: "text-base",
  h6: "text-sm",
} as const;

type HeadingTag = keyof typeof HEADING_SCALES;

function commentableHeading(tag: HeadingTag): React.FC<MarkdownElementProps> {
  const Heading: React.FC<MarkdownElementProps> = ({
    className,
    node: _node,
    ...rest
  }) =>
    createElement(tag, {
      className: cn("my-0 font-semibold", HEADING_SCALES[tag], className),
      "data-streamdown": `heading-${tag.slice(1)}`,
      ...rest,
    });
  Heading.displayName = `CommentableHeading${tag.toUpperCase()}`;
  return Heading;
}

/**
 * Block-level Markdown elements whose Streamdown margins would float them
 * inside the commentable wrapper. `blockquote` keeps its rule and tone with no
 * vertical margin; the horizontal rule keeps a hairline gap.
 */
const COMMENTABLE_BLOCK_ELEMENTS = {
  h1: commentableHeading("h1"),
  h2: commentableHeading("h2"),
  h3: commentableHeading("h3"),
  h4: commentableHeading("h4"),
  h5: commentableHeading("h5"),
  h6: commentableHeading("h6"),
  blockquote: ({ className, node: _node, ...rest }: MarkdownElementProps) =>
    createElement("blockquote", {
      className: cn(
        "my-0 border-muted-foreground/30 border-l-4 pl-4 text-muted-foreground italic",
        className,
      ),
      "data-streamdown": "blockquote",
      ...rest,
    }),
  hr: ({ className, node: _node, ...rest }: MarkdownElementProps) =>
    createElement("hr", {
      className: cn("my-1 border-border", className),
      "data-streamdown": "horizontal-rule",
      ...rest,
    }),
};

export const COMMENTABLE_BLOCK_COMPONENTS = {
  tr: CommentableTableRow,
  li: CommentableListItem,
  ...COMMENTABLE_BLOCK_ELEMENTS,
};
