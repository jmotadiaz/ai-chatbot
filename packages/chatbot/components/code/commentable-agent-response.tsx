"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { MessageSquare } from "lucide-react";
import { createPortal } from "react-dom";
import { Block, parseMarkdownIntoBlocks } from "streamdown";
import { CodingAgentMarkdownAnchor } from "./coding-agent-markdown-anchor";
import {
  CommentableListItem,
  CommentableTableRow,
  INTERACTIVE,
  LineCommentsContext,
  type MarkdownBlockKind,
} from "./line-comments";
import { CommentComposer } from "./file-browser/comment-composer";
import { useFileBrowser } from "./file-browser/file-browser-provider";
import {
  COMMENTED_CODE_LINE_CLASSES,
  SELECTED_CODE_LINE_CLASSES,
  commentMarkerClass,
  commentableBlockClass,
} from "./comment-styles";
import type {
  LineRange,
  ResponsePendingComment,
} from "./file-browser/types";
import { Response } from "@/components/chat/response";

const FENCE = /^\s*(?:```|~~~)/;
const CODE_LINE_SELECTOR =
  'pre[data-streamdown="code-block-body"] > code > span';

interface ResponseBlock extends LineRange {
  content: string;
  lineNumber: number;
  kind: MarkdownBlockKind;
  codeRange: LineRange | null;
  lang: string | null;
}

type SelectedAnchor = LineRange;

interface ResponseCommentsContextValue {
  blocks: (ResponseBlock | null)[];
  commentsByLine: Map<number, ResponsePendingComment>;
  selectedLine: number | null;
  onSelectLine: (line: number) => void;
  onSelectBlock: (range: LineRange) => void;
  renderComposer: (line: number) => ReactNode;
}

const ResponseCommentsContext =
  createContext<ResponseCommentsContextValue | null>(null);

function newlines(content: string): number {
  let count = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") count += 1;
  }
  return count;
}

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

function classifyBlock(content: string): MarkdownBlockKind {
  if (FENCE.test(content) || /^(?: {4}|\t)/.test(content)) return "code";
  if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(content)) return "list";
  const lines = content.split("\n");
  if (
    lines.length > 1 &&
    lines[0]?.includes("|") &&
    /^\s*\|?\s*:?-{3,}/.test(lines[1] ?? "")
  ) {
    return "table";
  }
  return "other";
}

/** Match Streamdown's own blocks 1-to-1 to prevent index drift. */
function responseBlocks(content: string): (ResponseBlock | null)[] {
  let searchFrom = 0;
  let lineNumber = 1;

  return parseMarkdownIntoBlocks(content).map((blockContent) => {
    const foundAt = content.indexOf(blockContent, searchFrom);
    const start = foundAt === -1 ? searchFrom : foundAt;
    lineNumber += newlines(content.slice(searchFrom, start));

    if (!blockContent.trim()) {
      lineNumber += newlines(blockContent);
      searchFrom = start + blockContent.length;
      return null;
    }

    const rawLines = blockContent.replace(/\n+$/, "").split("\n");
    const kind = classifyBlock(blockContent);
    const block: ResponseBlock = {
      content: blockContent,
      lineNumber,
      start: lineNumber,
      end: lineNumber + rawLines.length - 1,
      kind,
      codeRange: kind === "code" ? codeRange(lineNumber, rawLines) : null,
      lang:
        kind === "code"
          ? (blockContent.match(/^\s*(?:```|~~~)\s*([^\s`~]+)/)?.[1] ?? null)
          : null,
    };
    lineNumber += newlines(blockContent);
    searchFrom = start + blockContent.length;
    return block;
  });
}

type StreamdownBlockProps = ComponentProps<typeof Block>;

function selectCodeLine(
  event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
): number | null {
  const target = event.target as HTMLElement;
  if (target.closest(INTERACTIVE)) return null;
  const line = target.closest<HTMLElement>("[data-response-line]");
  if (!line) return null;
  const lineNumber = Number(line.dataset.responseLine);
  return Number.isInteger(lineNumber) ? lineNumber : null;
}

const RESPONSE_COMPONENTS = {
  a: CodingAgentMarkdownAnchor,
  tr: CommentableTableRow,
  li: CommentableListItem,
};

/** A Streamdown block with comment anchors; its Markdown renderer stays intact. */
const CommentableBlock: React.FC<StreamdownBlockProps> = (props) => {
  const comments = useContext(ResponseCommentsContext);
  const block = comments?.blocks[props.index];

  if (!comments || !block) return <Block {...props} />;

  const ordinaryCode = block.kind === "code" && block.lang !== "mermaid";
  const hasComment = comments.commentsByLine.has(block.lineNumber);
  const isSelected = comments.selectedLine === block.lineNumber;
  const lineContext = {
    blockLine: block.lineNumber,
    blockKind: block.kind,
    commentsByLine: comments.commentsByLine,
    selectedLine: comments.selectedLine,
    onSelectLine: comments.onSelectLine,
    renderComposer: comments.renderComposer,
  };
  const blockComposer =
    !ordinaryCode &&
    block.kind !== "list" &&
    block.kind !== "table" &&
    isSelected
      ? block.lineNumber
      : null;

  const renderedBlock = (
    <LineCommentsContext.Provider value={lineContext}>
      <Block {...props} />
    </LineCommentsContext.Provider>
  );

  if (ordinaryCode) return renderedBlock;

  return (
    <div
      data-response-comment-block={block.lineNumber}
      role="button"
      tabIndex={0}
      aria-label={`Comment on Markdown block starting at line ${block.lineNumber}`}
      data-comment-anchor="true"
      data-commented={hasComment ? "true" : undefined}
      data-selected={isSelected ? "true" : undefined}
      className={commentableBlockClass(hasComment, isSelected)}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
        comments.onSelectBlock({ start: block.start, end: block.end });
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        comments.onSelectBlock({ start: block.start, end: block.end });
      }}
    >
      <span
        className={commentMarkerClass(hasComment, isSelected)}
        aria-hidden="true"
      >
        <MessageSquare size={13} />
      </span>
      {renderedBlock}
      {blockComposer !== null && comments.renderComposer(blockComposer)}
    </div>
  );
};

export interface CommentableAgentResponseProps {
  children: string;
  messageId: string;
  turnNumber: number;
  comments: ResponsePendingComment[];
}

export const CommentableAgentResponse: React.FC<
  CommentableAgentResponseProps
> = ({ children, messageId, turnNumber, comments }) => {
  const { actions } = useFileBrowser();
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedAnchor, setSelectedAnchor] = useState<SelectedAnchor | null>(
    null,
  );
  const blocks = useMemo(() => responseBlocks(children), [children]);
  const sourceLines = useMemo(() => children.split("\n"), [children]);
  const commentsByLine = useMemo(() => {
    const map = new Map<number, ResponsePendingComment>();
    for (const comment of comments) map.set(comment.startLine, comment);
    return map;
  }, [comments]);
  const selectedLine = selectedAnchor?.start ?? null;
  const existingComment =
    selectedLine !== null ? commentsByLine.get(selectedLine) : undefined;

  const onSelectLine = useCallback((line: number) => {
    setSelectedAnchor((current) =>
      current?.start === line ? null : { start: line, end: line },
    );
  }, []);
  const onSelectBlock = useCallback((range: LineRange) => {
    setSelectedAnchor((current) =>
      current?.start === range.start ? null : range,
    );
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const decorate = () => {
      const codeBlocks = Array.from(
        root.querySelectorAll<HTMLElement>('[data-streamdown="code-block"]'),
      ).filter((codeBlock) => codeBlock.dataset.language !== "mermaid");
      const sourceBlocks = blocks.flatMap((block) =>
        block && block.kind === "code" && block.lang !== "mermaid"
          ? [block]
          : [],
      );

      codeBlocks.forEach((codeBlock, index) => {
        const block = sourceBlocks[index];
        if (!block?.codeRange) return;
        codeBlock.dataset.responseCodeBlock = String(block.lineNumber);
        const lines = codeBlock.querySelectorAll<HTMLElement>(CODE_LINE_SELECTOR);
        lines.forEach((line, lineIndex) => {
          const lineNumber = block.codeRange!.start + lineIndex;
          line.dataset.responseLine = String(lineNumber);
          line.setAttribute("role", "button");
          line.setAttribute("tabIndex", "0");
          line.setAttribute("aria-label", `Comment on line ${lineNumber}`);
          line.dataset.commented = commentsByLine.has(lineNumber)
            ? "true"
            : "false";
          line.dataset.selected =
            selectedLine === lineNumber ? "true" : "false";
          line.classList.add(
            "cursor-pointer",
            "transition-colors",
            "[&:hover:not(:has([data-comment-anchor]:hover)):not(:has([data-comment-composer]:hover))]:bg-zinc-100/70",
            "dark:[&:hover:not(:has([data-comment-anchor]:hover)):not(:has([data-comment-composer]:hover))]:bg-zinc-900/70",
          );
          for (const className of COMMENTED_CODE_LINE_CLASSES) {
            line.classList.toggle(
              className,
              commentsByLine.has(lineNumber),
            );
          }
          for (const className of SELECTED_CODE_LINE_CLASSES) {
            line.classList.toggle(className, selectedLine === lineNumber);
          }
        });

        const hostLine = String(block.lineNumber);
        let host = codeBlock.nextElementSibling as HTMLElement | null;
        if (host?.dataset.responseComposerHost !== hostLine) {
          host = document.createElement("div");
          host.dataset.responseComposerHost = hostLine;
          codeBlock.after(host);
        }
      });
    };

    decorate();
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(decorate);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [blocks, commentsByLine, selectedLine]);

  const saveComment = (text: string) => {
    if (!selectedAnchor) return;
    actions.upsertComment({
      id: existingComment?.id ?? crypto.randomUUID(),
      kind: "response",
      messageId,
      turnNumber,
      startLine: selectedAnchor.start,
      endLine: selectedAnchor.end,
      lineText: sourceLines
        .slice(selectedAnchor.start - 1, selectedAnchor.end)
        .join("\n"),
      text,
      createdAt: existingComment?.createdAt ?? Date.now(),
    });
    setSelectedAnchor(null);
  };

  const renderComposer = (line: number) => {
    const comment = commentsByLine.get(line);
    return (
      <CommentComposer
        key={`${selectedAnchor?.start ?? line}-${selectedAnchor?.end ?? line}`}
        lineNumber={line}
        endLine={selectedAnchor?.end ?? line}
        existing={comment}
        contextLabel={`Agent response · Turn ${turnNumber}`}
        sourceText={
          comment?.lineText ??
          sourceLines
            .slice(line - 1, selectedAnchor?.end ?? line)
            .join("\n")
        }
        onSave={saveComment}
        onRemove={() => {
          if (comment) actions.removeComment(comment.id);
          setSelectedAnchor(null);
        }}
        onCancel={() => setSelectedAnchor(null)}
      />
    );
  };

  const selectedCodeBlock =
    selectedAnchor && selectedAnchor.start === selectedAnchor.end
      ? blocks.find(
          (block): block is ResponseBlock =>
            block !== null &&
            block.kind === "code" &&
            block.lang !== "mermaid" &&
            block.codeRange !== null &&
            selectedAnchor.start >= block.codeRange.start &&
            selectedAnchor.start <= block.codeRange.end,
        )
      : undefined;
  const codeComposerHost = selectedCodeBlock
    ? rootRef.current?.querySelector<HTMLElement>(
        `[data-response-composer-host="${selectedCodeBlock.lineNumber}"]`,
      )
    : null;

  return (
    <ResponseCommentsContext.Provider
      value={{
        blocks,
        commentsByLine,
        selectedLine,
        onSelectLine,
        onSelectBlock,
        renderComposer,
      }}
    >
      <div
        ref={rootRef}
        onClick={(event) => {
          const line = selectCodeLine(event);
          if (line !== null) onSelectLine(line);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          const line = selectCodeLine(event);
          if (line === null) return;
          event.preventDefault();
          onSelectLine(line);
        }}
      >
        <Response
          className="h-auto"
          components={RESPONSE_COMPONENTS}
          BlockComponent={CommentableBlock}
          parseIncompleteMarkdown={false}
        >
          {children}
        </Response>
        {codeComposerHost && selectedLine !== null
          ? createPortal(renderComposer(selectedLine), codeComposerHost)
          : null}
      </div>
    </ResponseCommentsContext.Provider>
  );
};
