import type { PendingComment } from "./types";

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

function formatComment(comment: PendingComment): string {
  const line =
    comment.startLine === comment.endLine
      ? `Line ${comment.startLine}`
      : `Lines ${comment.startLine}-${comment.endLine}`;
  const snippet = formatSnippet(comment.lineText);
  return snippet
    ? `- ${line}: ${snippet} — ${comment.text}`
    : `- ${line}: ${comment.text}`;
}

/**
 * Builds the outgoing message from the user's prompt and pending line
 * comments. Handles all three cases: prompt only, comments only, both.
 */
export function serializeComments(
  prompt: string,
  comments: PendingComment[],
): string {
  const trimmedPrompt = prompt.trim();
  if (comments.length === 0) return trimmedPrompt;

  const byFile = new Map<string, PendingComment[]>();
  for (const comment of comments) {
    const list = byFile.get(comment.file) ?? [];
    list.push(comment);
    byFile.set(comment.file, list);
  }

  const sections: string[] = [];
  for (const [file, fileComments] of byFile) {
    const sorted = [...fileComments].sort((a, b) => a.startLine - b.startLine);
    sections.push(`### ${file}\n${sorted.map(formatComment).join("\n")}`);
  }

  const commentsBlock = `Code review comments:\n\n${sections.join("\n\n")}`;
  if (!trimmedPrompt) return commentsBlock;
  return `${trimmedPrompt}\n\n---\n${commentsBlock}`;
}
