import type { Message } from "@ag-ui/client";
import type { ThinkingLevel } from "models";
import type {
  PromptSummary,
  SessionSummary,
  WorkerSkill,
} from "@/lib/features/code/worker-client";

/** Position in a session's AG-UI event log; seq is meaningful only per epoch. */
export interface SessionCursor {
  epoch: string;
  seq: number;
}

/**
 * A session's conversation and the exact event-log boundary it represents.
 *
 * The worker produces the two together (`getSessionSnapshot`), and they are
 * only safe to use together: the messages are what has been finalized, and the
 * cursor is where a stream must resume so the still-partial tail arrives
 * exactly once.
 */
export interface SessionSnapshot {
  messages: Message[];
  cursor: SessionCursor | null;
  running: boolean;
}

/**
 * Everything the session page resolves during the server render.
 *
 * Lives here rather than next to its loader so client components can name the
 * type without importing a `server-only` module.
 *
 * Every field is nullable and null always means the same thing: the server
 * could not produce it, so the matching client hook should fetch it the way it
 * always did. Server rendering is an optimization, never a requirement — a
 * worker that is slow, restarting, or unreachable degrades to client-side
 * loading instead of failing the page.
 */
export interface CodingAgentBootstrap {
  snapshot: SessionSnapshot | null;
  /**
   * Null also when the session genuinely has no model yet, which is
   * indistinguishable from a failed lookup here. The client then asks again
   * and reaches the same answer, so the ambiguity costs a request, not
   * correctness.
   */
  modelId: string | null;
  /**
   * Two states that must not be confused: `null` means the server never got an
   * answer, while `{ level: null }` means it did and the session has never
   * run. Only the first should make the client ask again.
   */
  thinking: { level: ThinkingLevel | null } | null;
  skills: WorkerSkill[] | null;
  prompts: PromptSummary[] | null;
  /** Sibling sessions offered by the prompt form's session picker. */
  promptSessions: SessionSummary[] | null;
}

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
