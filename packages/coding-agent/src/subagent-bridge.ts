/**
 * Handoff of the subagent runner from the worker to the Pi extension.
 *
 * Pi loads extensions through jiti (`moduleCache: false`, and `tryNative`
 * left at its `false` default outside Bun), a module runtime separate from
 * the one the worker runs under. Anything an extension imports by path is
 * re-evaluated inside jiti, so an extension importing `session-manager`
 * would get a second copy of it — with its own empty `sessions` Map, and its
 * own `AsyncLocalStorage` in `tracing`. `runSubagent` could then never find
 * the parent session, and the throw would leave no trace behind.
 *
 * The global symbol registry is the one namespace both runtimes share, so
 * the worker publishes the runner here at startup and the extension resolves
 * it at call time. This module is duplicated by jiti too, but harmlessly:
 * both copies resolve `Symbol.for` to the same key and read the same
 * `globalThis`. It must stay free of worker imports — a single one would
 * pull the whole session-manager graph back into the extension's copy.
 */

export interface SubagentRunParams {
  task: string;
  description?: string;
  model?: string;
  cwd?: string;
}

export interface SubagentDetails {
  subSessionId: string;
  parentSessionId: string;
  parentToolCallId: string;
  description?: string;
}

export interface SubagentRunResult {
  content: Array<{ type: "text"; text: string }>;
  details: SubagentDetails;
  isError?: boolean;
}

export type SubagentRunner = (
  parentSessionId: string,
  toolCallId: string,
  params: SubagentRunParams,
  signal?: AbortSignal,
) => Promise<SubagentRunResult>;

/** `Symbol.for` keys live in a process-wide registry, unlike module scope. */
const RUNNER_KEY = Symbol.for("codingAgent.subagentRunner");

type RunnerHolder = { [RUNNER_KEY]?: SubagentRunner };

/** Called once by the worker entrypoint, before any session can be created. */
export function setSubagentRunner(runner: SubagentRunner): void {
  (globalThis as RunnerHolder)[RUNNER_KEY] = runner;
}

/**
 * Resolved by the extension on every call rather than at load time: the
 * extension is loaded per session, and only the worker knows when the
 * runner is ready.
 */
export function getSubagentRunner(): SubagentRunner | undefined {
  return (globalThis as RunnerHolder)[RUNNER_KEY];
}
