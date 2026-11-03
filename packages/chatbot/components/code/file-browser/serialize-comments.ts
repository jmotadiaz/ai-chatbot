import {
  isResponseComment,
  type FilePendingComment,
  type PendingComment,
  type ResponsePendingComment,
} from "./types";

const MAX_SNIPPET_LENGTH = 60;

function formatSnippet(lineText: string): string {
  const trimmed = lineText.trim().replace(/`/g, "");
  if (!trimmed) return "";
  const snippet =
    trimmed.length > MAX_SNIPPET_LENGTH
      ? `${trimmed.slice(0, MAX_SNIPPET_LENGTH)}…`
      : trimmed;
  return `\`${snippet}\``;
}

function formatLineRange(comment: PendingComment): string {
  return comment.startLine === comment.endLine
    ? `Line ${comment.startLine}`
    : `Lines ${comment.startLine}-${comment.endLine}`;
}

function formatFileComment(comment: FilePendingComment): string {
  const snippet = formatSnippet(comment.lineText);
  const line = formatLineRange(comment);
  return snippet
    ? `- ${line}: ${snippet} — ${comment.text}`
    : `- ${line}: ${comment.text}`;
}

function formatResponseComment(comment: ResponsePendingComment): string {
  const source = comment.lineText
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
  return [
    `- ${formatLineRange(comment)}`,
    `  Message ID: ${comment.messageId}`,
    "  Source:",
    source,
    `  Comment: ${comment.text}`,
  ].join("\n");
}

/**
 * Builds the outgoing message from the user's prompt and pending comments.
 * File comments keep their original format; response comments carry a full
 * source snapshot so the agent can locate the referenced passage.
 */
export function serializeComments(
  prompt: string,
  comments: PendingComment[],
): string {
  const trimmedPrompt = prompt.trim();
  if (comments.length === 0) return trimmedPrompt;

  const byFile = new Map<string, FilePendingComment[]>();
  const byResponse = new Map<string, ResponsePendingComment[]>();
  for (const comment of comments) {
    if (isResponseComment(comment)) {
      const key = `${comment.turnNumber}:${comment.messageId}`;
      const list = byResponse.get(key) ?? [];
      list.push(comment);
      byResponse.set(key, list);
    } else {
      const list = byFile.get(comment.file) ?? [];
      list.push(comment);
      byFile.set(comment.file, list);
    }
  }

  const blocks: string[] = [];
  if (byFile.size > 0) {
    const sections: string[] = [];
    for (const [file, fileComments] of byFile) {
      const sorted = [...fileComments].sort(
        (a, b) => a.startLine - b.startLine,
      );
      sections.push(
        `### ${file}\n${sorted.map(formatFileComment).join("\n")}`,
      );
    }
    blocks.push(`Code review comments:\n\n${sections.join("\n\n")}`);
  }

  if (byResponse.size > 0) {
    const groups = [...byResponse.values()].sort(
      (a, b) =>
        (a[0]?.turnNumber ?? 0) - (b[0]?.turnNumber ?? 0) ||
        (a[0]?.messageId ?? "").localeCompare(b[0]?.messageId ?? ""),
    );
    const sections = groups.map((responseComments) => {
      const first = responseComments[0]!;
      const sorted = [...responseComments].sort(
        (a, b) => a.startLine - b.startLine,
      );
      return `### Response ${first.turnNumber}\n${sorted
        .map(formatResponseComment)
        .join("\n")}`;
    });
    blocks.push(`Response comments:\n\n${sections.join("\n\n")}`);
  }

  const commentsBlock = blocks.join("\n\n");
  if (!trimmedPrompt) return commentsBlock;
  return `${trimmedPrompt}\n\n---\n${commentsBlock}`;
}
