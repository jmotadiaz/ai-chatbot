import type { AgentItem } from "./types";
import {
  isResponseComment,
  type PendingComment,
  type ResponsePendingComment,
} from "@/components/code/file-browser/types";

export interface ResponseCommentTarget {
  turnNumber: number;
}

/**
 * A response becomes commentable only when its turn is complete. Within each
 * turn, intermediate assistant prose is deliberately excluded: only the last
 * non-empty assistant message represents the agent's final response.
 */
export function responseCommentTargets(
  items: AgentItem[],
  isRunning: boolean,
): Map<string, ResponseCommentTarget> {
  const targets = new Map<string, ResponseCommentTarget>();
  let turnNumber = 0;
  let candidate: { messageId: string; turnNumber: number } | null = null;

  const finishTurn = () => {
    if (candidate) targets.set(candidate.messageId, { turnNumber: candidate.turnNumber });
    candidate = null;
  };

  for (const item of items) {
    if (item.kind === "user") {
      finishTurn();
      turnNumber += 1;
      continue;
    }
    if (
      item.kind === "assistant" &&
      typeof item.message.content === "string" &&
      item.message.content.trim().length > 0 &&
      turnNumber > 0
    ) {
      candidate = { messageId: item.message.id, turnNumber };
    }
  }

  if (!isRunning) finishTurn();
  return targets;
}

export function findOrphanedResponseComment(
  items: AgentItem[],
  comments: PendingComment[],
): ResponsePendingComment | undefined {
  const assistantIds = new Set(
    items.flatMap((item) =>
      item.kind === "assistant" ? [item.message.id] : [],
    ),
  );
  return comments.find(
    (comment) =>
      isResponseComment(comment) && !assistantIds.has(comment.messageId),
  ) as ResponsePendingComment | undefined;
}
