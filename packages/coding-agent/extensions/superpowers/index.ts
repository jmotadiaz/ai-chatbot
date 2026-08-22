import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { USING_SUPERPOWERS_PROMPT } from "./using-superpowers";

// Lazy trace logger — `tracing` is not in pi's VIRTUAL_MODULES, but jiti
// will resolve it via normal Node resolution (workspace package). If it
// fails we fall back to no-op so the extension never breaks harness startup.
let _traceLog: { info: (event: string, payload?: unknown) => void } | null = null;
async function getTraceLog() {
  if (_traceLog) return _traceLog;
  try {
    const mod = await import("tracing");
    _traceLog = mod.getTraceLogger("worker") as unknown as {
      info: (event: string, payload?: unknown) => void;
    };
    return _traceLog;
  } catch {
    return null;
  }
}

/**
 * Superpowers extension: registers the vendored skills (skills/) as resources
 * and injects the using-superpowers bootstrap.
 *
 * Upstream injects the bootstrap through the extension `context` event (user
 * message prepend). In this harness the `context` event is dead — the SDK's
 * provider adapters (`@earendil-works/pi-ai`) never consume `transformContext`
 * — so the content lives in `./using-superpowers.ts` and is injected here via
 * `before_agent_start`. That hook is verified to fire on every turn (see
 * `src/session-manager.ts` prompt flow) and lets us append the bootstrap to
 * the system prompt — same channel as the previous `resourceLoaderOptions.
 * appendSystemPrompt`, but owned by the extension (intercambio, no superposición).
 *
 * The extension is not loaded for subagent runtimes at all (see
 * `getExtensionPaths({ includeSuperpowersExtension: false })`), so the
 * bootstrap and the 13 skills are orchestrator-only by construction — no
 * `<SUBAGENT-STOP>` block needed.
 */
const extensionDir = dirname(fileURLToPath(import.meta.url));
const skillsDir = resolve(extensionDir, "skills");

export default function superpowersExtension(pi: ExtensionAPI): void {
  pi.on("resources_discover", async () => ({
    skillPaths: [skillsDir],
  }));

  // Append bootstrap to the system prompt on every turn. `before_agent_start`
  // fires for each prompt (including after compaction) and its
  // `systemPrompt` return value replaces `agent.state.systemPrompt` for that
  // turn — verified path via `AgentSession.prompt()` →
  // `ExtensionRunner.emitBeforeAgentStart()` → `agent.state.systemPrompt`.
  // Append keeps the bootstrap at the end, as the previous
  // `resourceLoaderOptions.appendSystemPrompt` did (you prefer append over
  // prepend). Traces below let you compare harness behaviour across sessions.
  pi.on("before_agent_start", async (event) => {
    const base = event.systemPrompt ?? "";
    const hasBootstrapBefore = base.includes("You have superpowers");
    const systemPrompt = base
      ? `${base}\n\n${USING_SUPERPOWERS_PROMPT}`
      : USING_SUPERPOWERS_PROMPT;
    // Trace for harness comparison — visible in `lifecycle.ndjson` / `raw.ndjson`
    // as `debug.superpowers_bootstrap_injection` (worker layer).
    void getTraceLog().then((log) => {
      log?.info("debug.superpowers_bootstrap_injection", {
        mechanism: "before_agent_start (systemPrompt append)",
        hasBootstrapBefore,
        hasBootstrapAfter: true,
        baseLength: base.length,
        injectedLength: systemPrompt.length,
        bootstrapLength: USING_SUPERPOWERS_PROMPT.length,
        promptLength: event.prompt?.length ?? 0,
        promptPreview: event.prompt?.slice(0, 200) ?? "",
      });
    });
    return { systemPrompt };
  });
}