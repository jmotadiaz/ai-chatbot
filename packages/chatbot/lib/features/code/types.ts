import type { Message } from "@ag-ui/client";

export type ToolCallStatus = "running" | "ok" | "error";

export interface ToolCallGroup {
  id: string;
  name: string;
  args: string;
  argsParsed?: unknown;
  result?: string;
  status: ToolCallStatus;
  startedAt?: number;
  finishedAt?: number;
  summary: string;
}

export type AgentItem =
  | { kind: "user"; message: Message }
  | { kind: "reasoning"; message: Message }
  | { kind: "assistant"; message: Message; toolGroups: ToolCallGroup[] };
