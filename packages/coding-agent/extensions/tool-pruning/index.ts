import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  ToolPruningEpochRunner,
  type ToolPruningCredentials,
} from "../../src/pruning/epoch-runner";
import { getToolPruningBridge } from "../../src/pruning/pruning-bridge";

/**
 * Tool Pruning: watermark-gated Epoch masking of stale tool calls and results
 * (spec D1/D3/D8).
 *
 * Why it exists: a long Coding Agent Session accumulates `read`, `grep` and
 * `bash` payloads that go obsolete a few Turns later, and they push Pi into a
 * lossy Compaction. This extension masks them in the projection the provider
 * receives (`pi.on("context")`) while the session `.jsonl`, the AG-UI event log
 * and the Coding Agent UI keep the full transcript. It stays silent — zero HTTP
 * calls, zero added latency, KV-cache intact — until a watermark says the
 * context is actually under pressure.
 *
 * This file is a thin shell: every decision lives in `src/pruning/` so it stays
 * unit-testable. It only resolves what the runner cannot own from inside jiti:
 *
 * - credentials from `ctx.model` / `ctx.modelRegistry.getApiKeyAndHeaders`
 *   (ADR 0011 §6 and ADR 0014: never `process.env`, never global config),
 * - the active session branch, which is what makes pruning branch-aware, and
 * - the worker's real trace logger, resolved through the pruning bridge
 *   (`src/pruning/pruning-bridge.ts`) because jiti re-evaluates `tracing` into a
 *   second module instance with its own `AsyncLocalStorage`.
 *
 * Only `pi.on("context")` is registered. The monotonic watermark staircase of
 * spec D3 needs no Turn arming and no first-call-only rule: every `context`
 * call compares the masked context against the next unconsumed step, and the
 * consumed steps live in the session branch, so a Turn, a mid-Turn step and a
 * Subagent all share exactly one cadence. No `session_compact` hook either:
 * `masksFromBranch` only reads entries after the latest `compaction` entry, so
 * a Compaction rearms every step on its own (spec D7).
 */
export default function registerToolPruningExtension(pi: ExtensionAPI): void {
  const scopes = new Map<string, SessionScope>();

  const scopeFor = (ctx: ExtensionContext): SessionScope => {
    const sessionId = ctx.sessionManager.getSessionId();
    const existing = scopes.get(sessionId);
    if (existing !== undefined) {
      existing.context.current = ctx;
      return existing;
    }

    // The runner reads the *latest* context of its own session: the model, its
    // context window and the Turn signal can all change between turns.
    const context: { current: ExtensionContext } = { current: ctx };
    const bridge = getToolPruningBridge();
    const instance = new ToolPruningEpochRunner({
      cwd: ctx.cwd,
      config: bridge?.config,
      getContextWindow: () => context.current.model?.contextWindow,
      getCredentials: () => credentialsOf(context.current),
      appendEntry: (customType, entry) => pi.appendEntry(customType, entry),
      getBranch: () => context.current.sessionManager.getBranch(),
      getLeafId: () => context.current.sessionManager.getLeafId(),
      getSessionId: () => context.current.sessionManager.getSessionId(),
      getSignal: () => context.current.signal,
      // Resolved per event, never at load: the worker publishes the bridge at
      // startup and only its own copy of `tracing` sees the Turn's trace sink.
      getTraceLogger: () => getToolPruningBridge()?.traceLogger?.(),
    });
    const scope: SessionScope = { instance, context };
    scopes.set(sessionId, scope);
    return scope;
  };

  pi.on("context", async (event, ctx) => {
    const projection = await scopeFor(ctx).instance.onContext(event.messages);
    return projection.changed ? { messages: projection.messages } : undefined;
  });
}

/** One runner plus the mutable handle to its session's latest extension context. */
interface SessionScope {
  readonly instance: ToolPruningEpochRunner;
  readonly context: { current: ExtensionContext };
}

/**
 * Gateway credentials of the resolved model, or `undefined` when there is no
 * model to reach `/v1/systemone` with (no model means no Epoch either).
 *
 * `ctx.model.baseUrl` already points at `${gatewayUrl}/v1` of the active
 * Environment or sandbox, so it is used verbatim; the bearer token and any
 * extra headers come from the session's `ModelRegistry`.
 */
async function credentialsOf(
  ctx: ExtensionContext,
): Promise<ToolPruningCredentials | undefined> {
  const model = ctx.model;
  if (model === undefined || model.baseUrl.length === 0) return undefined;

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) return undefined;

  const apiKey = typeof auth.apiKey === "string" && auth.apiKey.length > 0 ? auth.apiKey : undefined;
  const headers = headerRecord(auth.headers);
  return {
    baseUrl: model.baseUrl,
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(headers === undefined ? {} : { headers }),
  };
}

/**
 * `ProviderHeaders` allows `null` to suppress a default header. The decision
 * client only needs the headers that exist, so nulls are dropped here instead
 * of leaking into the request.
 */
function headerRecord(
  headers: Readonly<Record<string, string | null>> | undefined,
): Record<string, string> | undefined {
  if (headers === undefined) return undefined;
  const record: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") record[name] = value;
  }
  return Object.keys(record).length === 0 ? undefined : record;
}
