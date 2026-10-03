import { ToolLoopAgent } from "ai";
import type { ToolSet } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";
import { wrapWithTracing } from "tracing";
import type {
  CreateAgentOptions,
  LanguageModelKey,
  LanguageModelOptions,
  ModelConfiguration,
} from "./types";

type LanguageModelResolver = (
  key: LanguageModelKey,
  options?: LanguageModelOptions,
) => ModelConfiguration;

/**
 * Resolves `idOrRole` through this kit's own `languageModel` and wraps the
 * model with tracing when `TRACE_ENABLED=1` — `wrapWithTracing` itself
 * no-ops when tracing is off, mirroring the only tracing wrap that existed
 * before this moved into the kit (`conversation/factory.ts`'s
 * `buildAgentAdapter`). This is the traced Model Configuration `createAgent`
 * builds a `ToolLoopAgent` from; factored out so a caller that needs the
 * model itself rather than a `ToolLoopAgent` (a different agent class, e.g.
 * the chatbot's Context7 branch) can get it without duplicating the tracing
 * call — no chatbot code imports `wrapWithTracing`/`isTracingEnabled` itself.
 */
function resolveTracedModel(
  languageModel: LanguageModelResolver,
  idOrRole: LanguageModelKey,
  options?: LanguageModelOptions,
): ModelConfiguration {
  const base = languageModel(idOrRole, options);
  const model = wrapWithTracing(
    base.model as LanguageModelV3,
    config.traceRunId() ?? "default",
  );
  return { ...base, model };
}

/** Builds the kit's `createAgentModel(idOrRole, options)` member — see `resolveTracedModel`. */
export function createAgentModelResolver(
  languageModel: LanguageModelResolver,
): (
  idOrRole: LanguageModelKey,
  options?: LanguageModelOptions,
) => ModelConfiguration {
  return (idOrRole, options) =>
    resolveTracedModel(languageModel, idOrRole, options);
}

/**
 * Builds `createAgent(idOrRole, options)`: resolves the traced Model
 * Configuration for a catalog id or Model Role (`resolveTracedModel`, the
 * same helper `createAgentModel` uses) and returns a `ToolLoopAgent`. This
 * generalizes the repeated `new ToolLoopAgent({...modelConfiguration, ...})`
 * construction found across the chatbot's Chat Modes.
 */
export function createAgentResolver(languageModel: LanguageModelResolver) {
  return function createAgent<TOOLS extends ToolSet = ToolSet>(
    idOrRole: LanguageModelKey,
    { instructions, tools, overrides }: CreateAgentOptions<TOOLS> = {},
  ): ToolLoopAgent<never, TOOLS> {
    const base = resolveTracedModel(languageModel, idOrRole);

    return new ToolLoopAgent<never, TOOLS>({
      ...base,
      instructions,
      tools: tools as TOOLS,
      ...overrides,
    });
  };
}
