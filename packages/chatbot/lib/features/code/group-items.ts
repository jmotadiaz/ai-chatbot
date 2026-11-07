import type { Message } from "@ag-ui/client";
import { describeToolCall } from "./tool-summary";
import type { AgentItem, ToolCallGroup } from "./types";
import { safeStringify } from "./json";

function tryParse(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function stringContent(content: unknown): string {
  if (typeof content === "string") return content;
  return safeStringify(content ?? "");
}

function extractArgs(tc: { function?: { arguments?: string }; args?: unknown }): {
  raw: string;
  parsed: unknown;
} {
  const argString =
    typeof tc.function?.arguments === "string" ? tc.function.arguments : "";
  if (argString) {
    const parsed = tryParse(argString);
    return { raw: argString, parsed: parsed ?? argString };
  }
  if (tc.args !== undefined) {
    return { raw: safeStringify(tc.args), parsed: tc.args };
  }
  return { raw: "", parsed: undefined };
}

export interface GroupItemsOptions {
  project?: string;
}

export function groupItems(
  messages: Message[],
  toolErrors?: ReadonlyMap<string, true>,
  toolTimings?: ReadonlyMap<string, { startedAt: number; finishedAt?: number }>,
  options?: GroupItemsOptions,
): AgentItem[] {
  const out: AgentItem[] = [];
  let current: Extract<AgentItem, { kind: "assistant" }> | null = null;
  const toolGroupsById = new Map<string, ToolCallGroup>();

  const flush = () => {
    if (current) {
      out.push(current);
      current = null;
    }
  };

  for (const m of messages) {
    if (m.role === "assistant") {
      flush();
      const toolGroups: ToolCallGroup[] = (m.toolCalls ?? []).map((tc) => {
        const { raw, parsed } = extractArgs(tc as never);
        const timing = toolTimings?.get(tc.id);
        const startedAt = timing?.startedAt;
        const finishedAt = timing?.finishedAt;
        const toolName = (tc.function?.name ?? tc.type ?? "tool") as string;
        const desc = describeToolCall(toolName, parsed, {
          project: options?.project,
          rawArgs: raw,
        });
        const group: ToolCallGroup = {
          id: tc.id,
          name: toolName,
          args: raw,
          argsParsed: parsed,
          status: finishedAt
            ? toolErrors?.has(tc.id)
              ? "error"
              : "ok"
            : "running",
          startedAt,
          finishedAt,
          summary: desc.summary,
          summaryTitle: desc.title,
        };
        toolGroupsById.set(group.id, group);
        return group;
      });
      current = { kind: "assistant", message: m, toolGroups };
      continue;
    }

    if (m.role === "tool") {
      const id = (m as Message & { toolCallId?: string }).toolCallId;
      const group = id ? toolGroupsById.get(id) : undefined;
      if (id && group) {
        group.result = stringContent(m.content);
        group.status = toolErrors?.has(id) ? "error" : "ok";
        const timing = toolTimings?.get(id);
        group.finishedAt = timing?.finishedAt;
        const desc = describeToolCall(
          group.name,
          group.argsParsed,
          {
            project: options?.project,
            rawArgs: group.args,
            result: group.result,
            status: group.status,
          },
        );
        group.summary = desc.summary;
        group.summaryTitle = desc.title;
        continue;
      }
      // Orphan tool message: drop.
      if (typeof console !== "undefined") {
         
        console.debug("groupItems.orphan_tool", { id });
      }
      continue;
    }

    if (m.role === "user" || m.role === "reasoning") {
      flush();
      out.push({ kind: m.role, message: m });
    }
  }

  flush();
  return out;
}
