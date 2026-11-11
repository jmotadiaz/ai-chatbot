/**
 * Shared message fixtures of the Tool Pruning unit suites.
 *
 * `mask`, `cooling-window`, `supersession`, `decision-state` and `epoch-runner`
 * all build tiny `AgentMessage[]` histories, and every one of them needs the
 * same primitives: a user prompt, an assistant turn (prose, a tool call or
 * both), a paired tool result and a config with overrides. Keeping the
 * primitives here is what keeps one suite's fixture from drifting into a
 * slightly different notion of "a 1 000-token result".
 *
 * Fixture statics are deliberately boring: message timestamps are `1` unless a
 * test sets one, and the `usage` of a fixture assistant is the smallest valid
 * provider measurement. Suites that measure context tokens (the Epoch runner)
 * override `usage` explicitly instead of relying on a default that would look
 * like a real provider report.
 */
import {
  DEFAULT_TOOL_PRUNING_CONFIG,
  type AgentMessage,
  type AssistantMessage,
  type ToolCall,
  type ToolPruningConfig,
  type ToolResultMessage,
} from "../../../src/pruning/config";

/** Timestamp of every fixture message that does not set one. */
export const FIXTURE_TIMESTAMP = 1;

/** Smallest `usage` the accounting accepts as a provider measurement. */
export const usage: AssistantMessage["usage"] = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/** A provider `usage` reporting `totalTokens`, as an Epoch boundary. */
export const usageWith = (totalTokens: number): AssistantMessage["usage"] => ({
  input: totalTokens,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

/** A user prompt, which always passes the projection untouched (spec D1). */
export const user = (content: string, timestamp = FIXTURE_TIMESTAMP): AgentMessage => ({
  role: "user",
  content,
  timestamp,
});

/** An assistant message; `stopReason` follows from whether it carries calls. */
export const assistant = (
  content: AssistantMessage["content"],
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage => ({
  role: "assistant",
  content,
  api: "openai-completions",
  provider: "openai",
  model: "test-model",
  usage,
  stopReason: content.some((block) => block.type === "toolCall") ? "toolUse" : "stop",
  timestamp: FIXTURE_TIMESTAMP,
  ...overrides,
});

/** An assistant message that only speaks. */
export const prose = (
  value: string,
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage => assistant([{ type: "text", text: value }], overrides);

/** A `ToolCall` block. */
export const call = (
  id: string,
  name: string,
  args: Record<string, unknown>,
): ToolCall => ({ type: "toolCall", id, name, arguments: args });

export const read = (
  id: string,
  path = "src/app.ts",
  extra: Record<string, unknown> = {},
): ToolCall => call(id, "read", { path, ...extra });

export const write = (id: string, path = "src/app.ts"): ToolCall =>
  call(id, "write", { path });

export const edit = (id: string, path = "src/app.ts"): ToolCall =>
  call(id, "edit", { path });

export const bash = (id: string, command: string): ToolCall =>
  call(id, "bash", { command });

export const grep = (id: string, pattern: string): ToolCall =>
  call(id, "grep", { pattern });

/** A `ToolResultMessage` paired with a call by `toolCallId`. */
export const toolResult = (
  toolCallId: string,
  content: ToolResultMessage["content"],
  overrides: Partial<ToolResultMessage> = {},
): ToolResultMessage => ({
  role: "toolResult",
  toolCallId,
  toolName: "read",
  content,
  isError: false,
  timestamp: FIXTURE_TIMESTAMP,
  ...overrides,
});

/** `chars` of filler text: exactly `chars / 4` estimated tokens. */
export const bigText = (chars: number): { type: "text"; text: string } => ({
  type: "text",
  text: "x".repeat(chars),
});

/** The spec defaults plus per-test overrides. */
export const configWith = (overrides: Partial<ToolPruningConfig>): ToolPruningConfig => ({
  ...DEFAULT_TOOL_PRUNING_CONFIG,
  ...overrides,
});
