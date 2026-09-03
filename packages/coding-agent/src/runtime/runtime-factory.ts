import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  AuthStorage,
  ModelRegistry,
  type CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent";
import { getTraceContext, getTraceLogger } from "tracing";
import { getAuthJsonPath, getModelsJsonPath } from "./models";
import {
  getBuiltinSkillPaths,
  getExtensionPaths,
  getFirstPartySkillPathsFiltered,
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
    const authStorage = AuthStorage.create(getAuthJsonPath());
    // Child subagent runtimes execute one specific task from a self-contained
    // brief: they get neither the `subagent` tool, nor the superpowers
    // bootstrap, nor the superpowers skills. All three exclusions share the
    // same structural flag (spec §4.2 anti-recursion / orchestrator-only
    // skills).
    const isSubagentRuntime = options?.includeSubagentExtension === false;
    const services = await createAgentSessionServices({
      cwd: runtimeCwd,
      agentDir: getCodingAgentDir(),
      authStorage,
      modelRegistry: ModelRegistry.create(authStorage, getModelsJsonPath()),
      resourceLoaderOptions: {
        // FILE_REFERENCE_PROMPT is harness-owned. The superpowers bootstrap
        // (USING_SUPERPOWERS_PROMPT) is NOT appended here — the superpowers
        // extension injects it through the upstream `context` channel, as a
        // user message at the head of the context. See
        // `extensions/superpowers/index.ts` and
        // `extensions/superpowers/AGENTS.md`.
        appendSystemPrompt: [FILE_REFERENCE_PROMPT],
        additionalExtensionPaths: getExtensionPaths({
          includeSubagentExtension: options?.includeSubagentExtension ?? true,
          // Para rehabilitar la carga de la extensión superpowers, descomentar la siguiente línea y eliminar `includeSuperpowersExtension: false`:
          // includeSuperpowersExtension: !isSubagentRuntime,
          includeSuperpowersExtension: false,
        }),
        // Skills are discovered from `additionalExtensionPaths` only when the
        // path is a skill package (directory with `skills/`) — and in that
        // case the directory is NOT registered as an extension, so its hooks
        // never run. First-party extensions are therefore passed as files
        // (`index.ts`) and their skills provided explicitly here.
        // Standalone built-in skills from `skills/` are also passed here.
        additionalSkillPaths: [
          ...getBuiltinSkillPaths(),
          ...getFirstPartySkillPathsFiltered({
            includeSubagentExtension: options?.includeSubagentExtension ?? true,
            // Para rehabilitar la carga de la extensión superpowers, descomentar la siguiente línea y eliminar `includeSuperpowersExtension: false`:
            includeSuperpowersExtension: false,
          }),
        ],
      },
    });
    const { provider: piProvider, model: piModelId } = splitModelReference(modelId);
    const model =
      piProvider && piModelId ? services.modelRegistry.find(piProvider, piModelId) : undefined;
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
    // lifecycle so extension-provided skills and bootstrap hooks are active.
    await sessionResult.session.bindExtensions({ mode: "rpc" });

    // Ground truth for the superpowers bootstrap: wrap the agent's
    // `transformContext` (the function pi-agent-core calls in
    // `streamAssistantResponse`, right before `convertToLlm`) so the harness
    // records what the extension's `context` hook actually produced on the
    // real prompt path. The extension cannot trace this itself: jiti loads it
    // as an isolated module instance, so its `tracing` import resolves to a
    // second copy with no retained sink and every log is dropped.
    instrumentBootstrapInjection(sessionResult.session, sessionManager.getSessionId());

    // Harness trace for bootstrap state at bind time. The bootstrap itself
    // never lands in the system prompt: the extension injects it into the
    // context (see `debug.superpowers_context_transform`).
    {
      const log2 = getTraceLogger("worker");
      const sysPrompt = sessionResult.session.systemPrompt ?? "";
      log2.info("debug.harness_bootstrap_state", {
        mechanism: "context (extension, user message prepend)",
        isSubagentRuntime,
        // The bootstrap rides in the context, never in the system prompt, so
        // this is expected to stay false.
        hasBootstrapInSystemPromptAfterBind: sysPrompt.includes("You have superpowers"),
        systemPromptLengthAfterBind: sysPrompt.length,
        appendSystemPrompt: services.resourceLoader.getAppendSystemPrompt(),
        appendSystemPromptLengths: services.resourceLoader
          .getAppendSystemPrompt()
          .map((s) => s.length),
        extensionCount: services.resourceLoader.getExtensions().extensions.length,
        extensionPaths: services.resourceLoader
          .getExtensions()
          .extensions.map((e) => e.path),
        skillCount: services.resourceLoader.getSkills().skills.length,
        skillNames: services.resourceLoader.getSkills().skills.map((s) => s.name),
        sessionId: sessionManager.getSessionId(),
      });
    }

    return {
      ...sessionResult,
      services,
      diagnostics: services.diagnostics,
    };
  };
}

/** Marker the superpowers extension stamps on its bootstrap message. */
const SUPERPOWERS_BOOTSTRAP_MARKER = "superpowers:using-superpowers bootstrap for pi";

function messageText(message: unknown): string {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => (part as { text?: string }).text ?? "").join("");
}

/**
 * Trace whether the superpowers bootstrap reaches the provider payload.
 *
 * `agent.transformContext` is the last harness-visible point before
 * `convertToLlm` hands the messages to the provider adapter, and pi's
 * `convertToLlm` maps user messages 1:1, so a marker seen here is a marker
 * sent to the model. Emits `debug.superpowers_context_transform` per LLM call.
 *
 * The logger is resolved inside the wrapper, never captured here:
 * `getTraceLogger` snapshots the sink of the trace context that is current
 * when it is called, and this function runs while the session-creation run is
 * current. A logger captured at install time would write every later turn
 * into the creation run's trace — or into a sink already closed — instead of
 * the run that is actually prompting. Falls back to stderr when the turn
 * carries no trace context at all.
 */
export function instrumentBootstrapInjection<M>(
  session: {
    agent: {
      transformContext?: (messages: M[], signal?: AbortSignal) => Promise<M[]>;
    };
  },
  sessionId: string,
): void {
  const inner = session.agent.transformContext;
  session.agent.transformContext = async (messages: M[], signal?: AbortSignal) => {
    const before = messages.length;
    const transformed = inner ? await inner(messages, signal) : messages;
    const markerIndex = transformed.findIndex((m) =>
      messageText(m).includes(SUPERPOWERS_BOOTSTRAP_MARKER),
    );
    const payload = {
      sessionId,
      messageCountBefore: before,
      messageCountAfter: transformed.length,
      bootstrapInjected: transformed.length > before,
      bootstrapMarkerIndex: markerIndex,
      bootstrapLength: markerIndex >= 0 ? messageText(transformed[markerIndex]).length : 0,
      roles: transformed.slice(0, 4).map((m) => (m as { role?: string }).role),
    };
    getTraceLogger("worker").info("debug.superpowers_context_transform", payload);
    if (!getTraceContext()?.sink) {
      console.error(`[superpowers] context_transform ${JSON.stringify(payload)}`);
    }
    return transformed;
  };
}
