/**
 * Shared readers over the `AgentMessage[]` sequence (spec D5).
 *
 * Phase 0 (`supersession.ts`) and Phase 1 (`decision-state.ts`) both need to
 * find the `ToolCall` block behind a `toolCallId` and to read its arguments.
 * Keeping those readers here — instead of a private copy in each module — is
 * what keeps "first occurrence wins" and the argument coercion identical on
 * both sides of the decision engine.
 *
 * Everything here is pure and dependency-light, mirroring `mask.ts`: Pi loads
 * the extension through jiti in its own module runtime, so this module must
 * never import worker `src/` code.
 */
import type { AgentMessage, ToolCall } from "./config";

/**
 * Tool call blocks indexed by `toolCallId`, in chronology order.
 *
 * The first occurrence wins: a duplicated id cannot occur in a valid session
 * branch, and a stable pick is what the pairing invariants of spec D1 rely on.
 */
export function indexToolCalls(messages: readonly AgentMessage[]): Map<string, ToolCall> {
  const calls = new Map<string, ToolCall>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of message.content) {
      if (block.type !== "toolCall") continue;
      if (!calls.has(block.id)) calls.set(block.id, block);
    }
  }
  return calls;
}

/**
 * Arguments of a call as a plain record, or `undefined` when the call is
 * missing or its arguments are not an object. Tool arguments cross the model
 * boundary as JSON, so anything else carries no addressable target.
 */
export function callArguments(
  call: ToolCall | undefined,
): Record<string, unknown> | undefined {
  const args = call?.arguments;
  if (args === null || typeof args !== "object" || Array.isArray(args)) return undefined;
  return args as Record<string, unknown>;
}

/** String argument of a call, when present and non-empty. */
export function stringArgument(
  args: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const value = args?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Numeric argument of a call, accepting numeric strings (`"10"`). */
export function numberArgument(
  args: Readonly<Record<string, unknown>> | undefined,
  key: string,
): number | undefined {
  const value = args?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}
