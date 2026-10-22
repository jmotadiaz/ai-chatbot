import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  SettingsManager,
  type CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent";
import { GATEWAY_PROVIDER_ID } from "./gateway-catalog";
import { getModelRuntime } from "./model-runtime";
import { applyProviderRetryDefaults } from "./provider-retry-defaults";
import { getTraceLogger } from "tracing";
import {
  getBuiltinSkillPaths,
  getExtensionPaths,
  getFirstPartySkillPaths,
} from "./pi-packages";
import { getCodingAgentDir } from "./paths";
import { FILE_REFERENCE_PROMPT } from "./file-reference-prompt";

/**
 * Split a `provider/model-id` reference. Bare catalog ids (no slash, as sent by
 * the chatbot BFF against the single `model-gateway` provider) resolve to
 * `GATEWAY_PROVIDER_ID`; qualified `provider/model-id` strings (subagents,
 * tests, or ids with slashes after the provider prefix) split on the first slash.
 */
export function splitModelReference(
  modelId: string | undefined,
): { provider: string | undefined; model: string | undefined } {
  if (!modelId) return { provider: undefined, model: undefined };
  const slashIndex = modelId.indexOf("/");
  if (slashIndex === -1) return { provider: GATEWAY_PROVIDER_ID, model: modelId };
  return {
    provider: modelId.slice(0, slashIndex),
    model: modelId.slice(slashIndex + 1),
  };
}

/**
 * User-facing message for a model reference the catalog does not describe.
 * Shared by the session-create path (error RPC) and the turn path (in-band
 * RUN_ERROR) so both speak the same failure.
 */
export function unknownModelMessage(modelId: string, provider?: string): string {
  return (
    `Model "${modelId}" is not available in the coding agent's Model Catalog ` +
    `(provider ${provider ?? GATEWAY_PROVIDER_ID}). Refresh the model picker and retry; if it was just ` +
    "published, the Model Gateway catalog may need a moment to reach the worker."
  );
}

/**
 * Create the runtime factory reused for both new and reloaded sessions.
 * `strictModel` fails fast when the requested model is not in the catalog:
 * the create path (chatbot BFF `initializeSession`) wants the error, while
 * reloads of persisted sessions tolerate retired ids (Pi default + warning).
 */
export function makeCreateRuntime(
  modelId?: string,
  options?: { includeSubagentExtension?: boolean; strictModel?: boolean },
): CreateAgentSessionRuntimeFactory {
  return async ({ cwd: runtimeCwd, sessionManager, sessionStartEvent }) => {
    // Shared process-wide facade over credentials + model catalog (SDK ≥ 0.80.8
    // replaced AuthStorage/ModelRegistry with a single async ModelRuntime).
    const modelRuntime = await getModelRuntime();
    // Pi's own settings manager so the worker can set defaults (provider
    // retries) without writing settings.json; operator values win.
    const settingsManager = SettingsManager.create(
      runtimeCwd,
      getCodingAgentDir(),
    );
    applyProviderRetryDefaults(settingsManager);
    const services = await createAgentSessionServices({
      cwd: runtimeCwd,
      agentDir: getCodingAgentDir(),
      modelRuntime,
      settingsManager,
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
      if (options?.strictModel) {
        // A session created for a model the catalog does not describe would
        // silently run on Pi's default (the registry is authoritative) —
        // surface it to the caller instead of pretending it applied.
        throw new Error(unknownModelMessage(modelId ?? piModelId, piProvider));
      }
      // Reload of a persisted session whose model was retired from the
      // Gateway: keep the pre-existing behavior (no model → Pi default; the
      // explicit error shows up when the next turn carries a model id).
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

