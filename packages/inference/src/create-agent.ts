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

/**
 * Builds `createAgent(idOrRole, options)`: resolves the Model Configuration
 * for a catalog id or Model Role through this kit's own `languageModel`,
 * wraps the model with tracing when `TRACE_ENABLED=1` — `wrapWithTracing`
 * itself no-ops when tracing is off, mirroring the only tracing wrap that
 * exists today (`conversation/factory.ts`'s `buildAgentAdapter`) — and
 * returns a `ToolLoopAgent`. This generalizes the repeated
 * `new ToolLoopAgent({...modelConfiguration, ...})` construction found across
 * the chatbot's Chat Modes.
 */
export function createAgentResolver(
  languageModel: (
    key: LanguageModelKey,
    options?: LanguageModelOptions,
  ) => ModelConfiguration,
) {
  return function createAgent<TOOLS extends ToolSet = ToolSet>(
    idOrRole: LanguageModelKey,
    { instructions, tools, overrides }: CreateAgentOptions<TOOLS> = {},
  ): ToolLoopAgent<never, TOOLS> {
    const base = languageModel(idOrRole);
    const model = wrapWithTracing(
      base.model as LanguageModelV3,
      config.traceRunId() ?? "default",
    );

    return new ToolLoopAgent<never, TOOLS>({
      ...base,
      model,
      instructions,
      tools: tools as TOOLS,
      ...overrides,
    });
  };
}
