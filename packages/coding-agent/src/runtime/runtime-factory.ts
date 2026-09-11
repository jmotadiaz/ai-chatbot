import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  type CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent";
import { getModelRuntime } from "./model-runtime";
import { getTraceLogger } from "tracing";
import {
  getBuiltinSkillPaths,
  getExtensionPaths,
  getFirstPartySkillPaths,
} from "./pi-packages";
import { getCodingAgentDir } from "./paths";
import { FILE_REFERENCE_PROMPT } from "./file-reference-prompt";

/**
 * Split a `provider/model-id` reference. Model ids may themselves contain
 * slashes (e.g. vercel-ai-gateway routes like "meta/muse-spark-1.3-contributor"
 * or openrouter ids), so only the first slash separates provider from model.
 */
export function splitModelReference(
  modelId: string | undefined,
): { provider: string | undefined; model: string | undefined } {
  if (!modelId) return { provider: undefined, model: undefined };
  const slashIndex = modelId.indexOf("/");
  if (slashIndex === -1) return { provider: modelId, model: undefined };
  return {
    provider: modelId.slice(0, slashIndex),
    model: modelId.slice(slashIndex + 1),
  };
}

/**
 * Create the runtime factory reused for both new and reloaded sessions.
 */
export function makeCreateRuntime(
  modelId?: string,
  options?: { includeSubagentExtension?: boolean },
): CreateAgentSessionRuntimeFactory {
  return async ({ cwd: runtimeCwd, sessionManager, sessionStartEvent }) => {
    // Shared process-wide facade over credentials + model catalog (SDK ≥ 0.80.8
    // replaced AuthStorage/ModelRegistry with a single async ModelRuntime).
    const modelRuntime = await getModelRuntime();
    const services = await createAgentSessionServices({
      cwd: runtimeCwd,
      agentDir: getCodingAgentDir(),
      modelRuntime,
      resourceLoaderOptions: {
        // FILE_REFERENCE_PROMPT is harness-owned and appended to the system
        // prompt. Extensions do not inject anything here.
        appendSystemPrompt: [FILE_REFERENCE_PROMPT],
        additionalExtensionPaths: getExtensionPaths({
          includeSubagentExtension: options?.includeSubagentExtension ?? true,
        }),
        // Skills are discovered from `additionalExtensionPaths` only when the
        // path is a skill package (directory with `skills/`) — and in that
        // case the directory is NOT registered as an extension, so its hooks
        // never run. First-party extensions are therefore passed as files
        // (`index.ts`) and their skills provided explicitly here.
        // Standalone built-in skills from `skills/` are also passed here.
        additionalSkillPaths: [...getBuiltinSkillPaths(), ...getFirstPartySkillPaths()],
      },
    });
    const { provider: piProvider, model: piModelId } = splitModelReference(modelId);
    const model =
      piProvider && piModelId ? services.modelRuntime.getModel(piProvider, piModelId) : undefined;
    if (piProvider && piModelId && !model) {
      // The registry is authoritative; a missing entry means the session is
      // created without a model (Pi falls back to its default), which would
      // be a silent no-op for the caller. Surface it in the trace.
      getTraceLogger("worker").warn("session.model_not_in_registry", {
        modelId,
      });
    }
    const sessionResult = await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      model,
    });
    // Pi only emits session_start/resources_discover when the host binds the
    // extension runtime. The harness has no TUI, but still needs the RPC-mode
    // lifecycle so extension-provided resources and hooks are active.
    await sessionResult.session.bindExtensions({ mode: "rpc" });

    return {
      ...sessionResult,
      services,
      diagnostics: services.diagnostics,
    };
  };
}

