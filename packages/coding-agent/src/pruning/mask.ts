/**
 * Non-destructive Tool Pruning projection (spec D1).
 *
 * `applyPruningMask` rewrites the `AgentMessage[]` clone Pi hands to
 * `pi.on("context")` and nothing else: the session `.jsonl`, the AG-UI event
 * log and the Coding Agent UI keep the full transcript. The projection is pure:
 * it never mutates its input and returns the same message objects for every
 * untouched message.
 */
import {
  MIN_TRUNCATION_CHARS,
  type AgentMessage,
  type AssistantMessage,
  type TextContent,
  type ToolPruningConfig,
  type ToolPruningMaskMap,
  type ToolResultMessage,
} from "./config";

/**
 * Applies the persisted mask to a projected context.
 *
 * Masks are applied per `toolCallId` and only when the call and its result are
 * both present in `messages`; an in-flight or aborted call stays out of every
 * pruning operation so the provider never receives an unpaired `ToolCall` or
 * `ToolResultMessage`.
 */
export function applyPruningMask(
  messages: readonly AgentMessage[],
  masks: ToolPruningMaskMap,
  config: ToolPruningConfig,
): AgentMessage[] {
  const maskEntries = Object.entries(masks);
  if (maskEntries.length === 0) return messages.slice();

  const pairedResults = collectPairedResults(messages);
  const droppedCalls = new Set<string>();
  const stubbedResults = new Set<string>();

  for (const [toolCallId, decision] of maskEntries) {
    const result = pairedResults.get(toolCallId);
    // Unpaired call (still in flight or aborted): never prune, keep both sides.
    if (result === undefined) continue;
    if (decision === "drop_call") {
      droppedCalls.add(toolCallId);
    } else if (decision === "drop_result" && isStubbable(result)) {
      stubbedResults.add(toolCallId);
    }
  }

  if (droppedCalls.size === 0 && stubbedResults.size === 0) return messages.slice();

  const projected: AgentMessage[] = [];
  for (const message of messages) {
    if (message.role === "assistant") {
      const content = message.content.filter(
        (block) => !(block.type === "toolCall" && droppedCalls.has(block.id)),
      );
      if (content.length === message.content.length) {
        projected.push(message);
        continue;
      }
      // Reasoning or prose may outlive its calls; a turn reduced to orphaned
      // thinking (or nothing at all) is omitted entirely.
      if (!hasToolCall(content) && !hasVisibleText(content)) continue;
      projected.push({ ...message, content });
      continue;
    }

    if (message.role === "toolResult") {
      if (droppedCalls.has(message.toolCallId)) continue;
      if (stubbedResults.has(message.toolCallId)) {
        projected.push({ ...message, content: [buildStub(message, config)] });
        continue;
      }
      projected.push(message);
      continue;
    }

    // User prose, `BashExecutionMessage`, `CustomMessage`,
    // `CompactionSummaryMessage` and any future non-tool message pass through.
    projected.push(message);
  }

  return projected;
}

/**
 * Text a `ToolResultMessage` contributes to the provider payload, with its
 * image blocks excluded. Multiple text blocks are joined by a newline, which is
 * also the text the stub head and tail are sliced from.
 */
export function toolResultText(result: ToolResultMessage): string {
  return result.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .filter((text) => text.length > 0)
    .join("\n");
}

/**
 * Only paired results that carry images or exceed the minimum truncation size
 * may be stubbed; anything shorter would only gain stub overhead.
 */
function isStubbable(result: ToolResultMessage): boolean {
  if (result.content.some((block) => block.type === "image")) return true;
  return toolResultText(result).length > MIN_TRUNCATION_CHARS;
}

/**
 * Head + tail stub replacing a dropped result body. Keeping both ends preserves
 * command headers and file openings at the start and exit codes, test summaries
 * or final stack-trace frames at the end.
 */
function buildStub(result: ToolResultMessage, config: ToolPruningConfig): TextContent {
  const text = toolResultText(result);
  const imageCount = result.content.filter((block) => block.type === "image").length;
  const headChars = Math.max(0, Math.trunc(config.stubHeadChars));
  const tailChars = Math.max(0, Math.trunc(config.stubTailChars));

  const head = text.slice(0, headChars);
  // Never let the tail overlap the head, even with oversized stub settings.
  const remainingTailChars = Math.max(0, Math.min(tailChars, text.length - head.length));
  const tail = remainingTailChars === 0 ? "" : text.slice(text.length - remainingTailChars);
  const omitted = text.length - head.length - tail.length;

  const parts = [
    head,
    `… [Tool Pruning: omitted ${omitted} chars from ${result.toolName}; re-run or re-read if exact output is needed] …`,
  ];
  if (imageCount > 0) parts.push(`[${imageCount} image(s) omitted]`);
  if (tail.length > 0) parts.push(tail);

  return { type: "text", text: parts.join("\n") };
}

/** Results whose `ToolCall` is present in the same projection, keyed by id. */
function collectPairedResults(messages: readonly AgentMessage[]): Map<string, ToolResultMessage> {
  const callIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of message.content) {
      if (block.type === "toolCall") callIds.add(block.id);
    }
  }

  const paired = new Map<string, ToolResultMessage>();
  for (const message of messages) {
    if (message.role !== "toolResult" || !callIds.has(message.toolCallId)) continue;
    // First result wins; duplicated ids cannot occur in a valid session branch.
    if (!paired.has(message.toolCallId)) paired.set(message.toolCallId, message);
  }
  return paired;
}

function hasToolCall(content: AssistantMessage["content"]): boolean {
  return content.some((block) => block.type === "toolCall");
}

function hasVisibleText(content: AssistantMessage["content"]): boolean {
  return content.some((block) => block.type === "text" && block.text.trim().length > 0);
}
