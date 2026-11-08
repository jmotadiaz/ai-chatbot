import type { Message } from "@ag-ui/client";
import { toolDisplayName } from "./tool-presentation";
import type { AgentItem, ToolCallGroup } from "./types";

/**
 * What the transcript actually renders, derived from `AgentItem[]`.
 *
 * `groupItems` groups by Message role, which loses the order the model
 * produced: one assistant Message can carry reasoning, its user-facing text
 * and its tool calls at once. A ReAct Cycle is the contiguous run of reasoning
 * and tool calls that precedes an assistant response, so an assistant Message
 * that carries text closes the cycle and its tool calls open the next one.
 */
export type ConversationBlock =
  | { kind: "user"; id: string; message: Message }
  | { kind: "cycle"; id: string; cycle: ReActCycle }
  | { kind: "response"; id: string; message: Message };

export type ReActCycleStep =
  | { kind: "reasoning"; id: string; message: Message }
  | { kind: "tool"; id: string; group: ToolCallGroup };

/** Contiguous reasoning + tool calls of one Turn, ahead of an assistant response. */
export interface ReActCycle {
  /** Stable while the cycle's opening step is unchanged (React key, local open state). */
  id: string;
  /**
   * Id of the last assistant Message that contributed steps. Turn files are
   * anchored to the assistant Message that closed the turn, which may be a
   * cycle when the turn ended on tool calls.
   */
  originMessageId: string;
  steps: ReActCycleStep[];
}

function contentText(message: Message): string {
  return typeof message.content === "string" ? message.content : "";
}

/**
 * Fold `AgentItem[]` into transcript blocks, splitting assistant Messages at
 * their user-facing text: reasoning and tools before the text belong to the
 * cycle, tools emitted alongside it start a new one.
 */
export function buildConversationBlocks(items: AgentItem[]): ConversationBlock[] {
  const blocks: ConversationBlock[] = [];
  let cycle: ReActCycle | null = null;

  const flushCycle = () => {
    if (cycle && cycle.steps.length > 0) {
      blocks.push({ kind: "cycle", id: cycle.id, cycle });
    }
    cycle = null;
  };

  const appendStep = (originMessageId: string, step: ReActCycleStep) => {
    if (!cycle) {
      // Keyed by the step that opens the cycle: an assistant Message can open
      // two of them (its reasoning, then the tools it emitted with its text),
      // so the Message id alone would collide.
      const key = step.kind === "reasoning" ? `r:${step.id}` : `t:${step.id}`;
      cycle = { id: `cycle:${key}`, originMessageId, steps: [] };
    }
    cycle.originMessageId = originMessageId;
    cycle.steps.push(step);
  };

  for (const item of items) {
    if (item.kind === "user") {
      flushCycle();
      blocks.push({ kind: "user", id: item.message.id, message: item.message });
      continue;
    }

    if (item.kind === "reasoning") {
      if (contentText(item.message).trim().length === 0) continue;
      appendStep(item.message.id, {
        kind: "reasoning",
        id: item.message.id,
        message: item.message,
      });
      continue;
    }

    const hasText = contentText(item.message).trim().length > 0;
    if (hasText) {
      // The assistant addressed the user: the cycle is over before this text.
      flushCycle();
      blocks.push({
        kind: "response",
        id: item.message.id,
        message: item.message,
      });
    }
    if (item.toolGroups.length === 0) continue;
    for (const group of item.toolGroups) {
      appendStep(item.message.id, { kind: "tool", id: group.id, group });
    }
  }

  flushCycle();
  return blocks;
}

export interface ReActCycleHeader {
  /** Text of the collapsed trigger. */
  label: string;
  /** True while the cycle is still working: the label animates. */
  shimmer: boolean;
  /** Display names of the calls still in flight, in call order. */
  runningTools: string[];
  /** Raw tool name when exactly one call is in flight (drives the icon). */
  singleRunningTool?: { name: string; summary: string };
  hasError: boolean;
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function pluralTypeName(displayName: string): string {
  return `${displayName}s`;
}

/**
 * Label of a ReAct Cycle's collapsed trigger.
 *
 * Active cycles name the work in flight (thinking, one tool with its summary,
 * or how many calls of which types are running); finished cycles report what
 * the cycle did, with the error count last.
 */
export function describeReActCycle(
  cycle: ReActCycle,
  active: boolean,
): ReActCycleHeader {
  const groups = cycle.steps.flatMap((step) =>
    step.kind === "tool" ? [step.group] : [],
  );
  const reasoningCount = cycle.steps.length - groups.length;
  const errors = groups.filter((group) => group.status === "error").length;
  const running = groups.filter((group) => group.status === "running");
  const runningTools = running.map((group) => toolDisplayName(group.name));

  if (active) {
    if (running.length === 0) {
      return { label: "Thinking", shimmer: true, runningTools, hasError: false };
    }
    if (running.length === 1) {
      const [group] = running;
      const name = toolDisplayName(group.name);
      const summary = group.summary.trim();
      return {
        label: summary ? `${name} ${summary}` : name,
        shimmer: true,
        runningTools,
        singleRunningTool: { name: group.name, summary },
        hasError: false,
      };
    }
    // One entry per tool type, pluralised when several calls of it are in
    // flight: "3 tools: Shell; Subagents".
    const typeCounts = new Map<string, number>();
    for (const name of runningTools) {
      typeCounts.set(name, (typeCounts.get(name) ?? 0) + 1);
    }
    const types = [...typeCounts].map(([name, count]) =>
      count === 1 ? name : pluralTypeName(name),
    );
    return {
      label: `${running.length} tools: ${types.join("; ")}`,
      shimmer: true,
      runningTools,
      hasError: false,
    };
  }

  const parts: string[] = [];
  if (reasoningCount > 0) parts.push(countLabel(reasoningCount, "thought"));
  if (groups.length > 0) parts.push(countLabel(groups.length, "tool"));
  if (errors > 0) parts.push(countLabel(errors, "error"));

  return {
    label: parts.join(" · ") || "Thinking",
    shimmer: false,
    runningTools,
    hasError: errors > 0,
  };
}
