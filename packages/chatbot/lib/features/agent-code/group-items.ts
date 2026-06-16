import type { Message } from "@ag-ui/client";
import { summarizeToolCall } from "./tool-summary";
import type { AgentItem, ToolCallGroup } from "./types";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

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

export function groupItems(
  messages: Message[],
  toolErrors?: ReadonlyMap<string, true>,
  toolTimings?: ReadonlyMap<string, { startedAt: number; finishedAt?: number }>,
): AgentItem[] {
  const out: AgentItem[] = [];
  let current: Extract<AgentItem, { kind: "assistant" }> | null = null;

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
        const startedAt = timing?.startedAt ?? Date.now();
        const finishedAt = timing?.finishedAt;
        return {
          id: tc.id,
          name: tc.function?.name ?? tc.type ?? "tool",
          args: raw,
          argsParsed: parsed,
          status: "running",
          startedAt,
          finishedAt,
          summary: summarizeToolCall(
            (tc.function?.name ?? tc.type ?? "tool") as string,
            parsed,
          ),
        };
      });
      current = { kind: "assistant", message: m, toolGroups };
      continue;
    }

    if (m.role === "tool") {
      const id = (m as Message & { toolCallId?: string }).toolCallId;
      if (current && id) {
        const group = current.toolGroups.find((g) => g.id === id);
        if (group) {
          group.result = stringContent(m.content);
          group.status = toolErrors?.has(id) ? "error" : "ok";
          const timing = toolTimings?.get(id);
          group.finishedAt = timing?.finishedAt ?? Date.now();
          continue;
        }
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
