/**
 * Handoff of the Tool Pruning runtime services from the worker to the Pi
 * extension (spec D8).
 *
 * Pi loads `extensions/tool-pruning/index.ts` through jiti in its own module
 * runtime, so anything the extension imports by path is re-evaluated there:
 * importing `tracing` directly would hand the extension a second copy of the
 * library with its own `AsyncLocalStorage`, and the Epoch events would land in
 * a trace context that was never populated (no sink, no `runId`, no
 * `sessionId`). The global symbol registry is the one namespace both runtimes
 * share, so the worker publishes what the extension cannot own here:
 *
 * - a factory that resolves the **real** `getTraceLogger("worker")` inside the
 *   worker's tracing context at write time, and
 * - the optional `ToolPruningConfig` overrides injected through
 *   `WorkerRuntimeConfig` (tests).
 *
 * A factory is published instead of a `TraceLogger` instance because the
 * logger binds its sink from the tracing `AsyncLocalStorage` when it is
 * created: one created at startup would carry no sink at all.
 *
 * This module is duplicated by jiti too, but harmlessly: both copies resolve
 * `Symbol.for` to the same key and read the same `globalThis`. It must stay
 * free of worker imports — a single one would pull the whole worker graph back
 * into the extension's copy.
 */
import type { ToolPruningConfigOverrides } from "./config";

/**
 * The subset of the tracing library's `TraceLogger` the pruning engine uses.
 * Declared structurally so the worker can publish its own instance without
 * this module importing `tracing` (which jiti would re-evaluate).
 */
export interface ToolPruningTraceLogger {
  debug(eventName: string, payload?: unknown): void;
  info(eventName: string, payload?: unknown): void;
  warn(eventName: string, payload?: unknown): void;
  error(eventName: string, payload?: unknown): void;
}

/** Everything the worker hands to the Tool Pruning extension. */
export interface ToolPruningBridgeState {
  /** Resolves the real worker logger for the running Turn; called per event. */
  traceLogger?: () => ToolPruningTraceLogger;
  /**
   * `WorkerRuntimeConfig.toolPruning` overrides. The extension merges them over
   * the spec defaults; an absent bridge (or an empty object) means defaults.
   */
  config?: ToolPruningConfigOverrides;
}

/** `Symbol.for` keys live in a process-wide registry, unlike module scope. */
const BRIDGE_KEY = Symbol.for("codingAgent.toolPruningBridge");

type BridgeHolder = { [BRIDGE_KEY]?: ToolPruningBridgeState };

/** Called once by the worker entrypoint, before any session can be created. */
export function publishToolPruningBridge(state: ToolPruningBridgeState): void {
  (globalThis as BridgeHolder)[BRIDGE_KEY] = state;
}

/**
 * Resolved by the extension at call time rather than at load time: the bridge
 * only exists once the worker's composition root has resolved its config.
 */
export function getToolPruningBridge(): ToolPruningBridgeState | undefined {
  return (globalThis as BridgeHolder)[BRIDGE_KEY];
}

/** Test hook: forget the published bridge (call it from `afterEach`). */
export function resetToolPruningBridgeForTests(): void {
  delete (globalThis as BridgeHolder)[BRIDGE_KEY];
}
