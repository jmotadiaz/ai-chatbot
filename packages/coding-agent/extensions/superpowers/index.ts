import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { USING_SUPERPOWERS_PROMPT } from "./using-superpowers";

// Diagnostics. `tracing` resolves from here (workspace package), but jiti
// loads this extension as an isolated module instance, so its logger is a
// second copy of the module with no retained sink and its records go nowhere.
// The authoritative trace is `debug.superpowers_context_transform`, emitted by
// the harness in `src/session-manager.ts`; this line only leaves a breadcrumb
// in the worker's stderr.
function logInjection(payload: Record<string, unknown>): void {
  console.error(`[superpowers] bootstrap injected ${JSON.stringify(payload)}`);
}

/**
 * Superpowers extension: registers the vendored skills (skills/) as resources
 * and injects the using-superpowers bootstrap.
 *
 * The bootstrap travels through the same channel upstream uses: the `context`
 * event, which prepends it as a user message at the head of the context sent
 * to the model. That channel is live in this harness — `dist/core/sdk.js`
 * wires `transformContext` to `ExtensionRunner.emitContext`, and
 * `@earendil-works/pi-agent-core` applies it in `streamAssistantResponse`
 * before every provider call. Injecting there rather than appending to the
 * system prompt keeps the bootstrap where the model weighs it most, which is
 * what upstream relies on for spontaneous skill discovery.
 *
 * The transform runs on a clone of the message list, so the bootstrap never
 * reaches `session.messages`, the session file, or the UI transcript.
 *
 * Cadence is harness-owned and deliberately diverges from upstream. Upstream
 * arms the injection on `session_start`/`session_compact` and disarms it on
 * `agent_end`, so the bootstrap only rides the first turn of a session; from
 * turn two on it relies on the model choosing to load the `using-superpowers`
 * skill from the catalogue. This harness does not leave that to the model: the
 * bootstrap is injected on every LLM call. Being at the head of the context it
 * is also a stable cache prefix, since the conversation grows after it.
 *
 * The extension is not loaded for subagent runtimes at all (see
 * `getExtensionPaths({ includeSuperpowersExtension: false })`), so the
 * bootstrap and the 13 skills are orchestrator-only by construction — no
 * `<SUBAGENT-STOP>` block needed.
 */
const EXTREMELY_IMPORTANT_OPEN = "<EXTREMELY_IMPORTANT>";
const EXTREMELY_IMPORTANT_CLOSE = "</EXTREMELY_IMPORTANT>";
/**
 * Identifying line carried by the bootstrap message. Nothing branches on it:
 * the injection is unconditional. It exists so the harness can find the
 * message in a payload — `src/session-manager.ts` reports its index as
 * `bootstrapMarkerIndex` in `debug.superpowers_context_transform`.
 */
const BOOTSTRAP_MARKER = "superpowers:using-superpowers bootstrap for pi";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const skillsDir = resolve(extensionDir, "skills");

const BOOTSTRAP_MESSAGE_TEXT = `${EXTREMELY_IMPORTANT_OPEN}
${BOOTSTRAP_MARKER}

${USING_SUPERPOWERS_PROMPT}
${EXTREMELY_IMPORTANT_CLOSE}`;

export default function superpowersExtension(pi: ExtensionAPI): void {
  pi.on("resources_discover", async () => ({
    skillPaths: [skillsDir],
  }));

  // Unconditional prepend, no inspection of the list. `emitContext` hands each
  // handler a `structuredClone` of the agent's messages and the agent loop
  // throws the transformed copy away after the request, so a previous
  // injection leaves no trace to detect — a "have I already injected?" check
  // could only ever produce false positives. Upstream ships one; it would fire
  // on any tool result quoting the marker (a `read` of this very file, say)
  // and silently disable the bootstrap for the rest of the session.
  pi.on("context", async (event) => {
    const bootstrapMessage = {
      role: "user" as const,
      content: [{ type: "text" as const, text: BOOTSTRAP_MESSAGE_TEXT }],
      timestamp: Date.now(),
    };

    const insertAt = firstNonCompactionSummaryIndex(event.messages);
    logInjection({
      mechanism: "context (user message prepend)",
      insertAt,
      messageCount: event.messages.length,
      bootstrapLength: BOOTSTRAP_MESSAGE_TEXT.length,
    });

    return {
      messages: [
        ...event.messages.slice(0, insertAt),
        bootstrapMessage,
        ...event.messages.slice(insertAt),
      ],
    };
  });
}

/**
 * After a compaction the summary messages must stay at the head of the
 * context, so the bootstrap goes right after them.
 */
function firstNonCompactionSummaryIndex(messages: unknown[]): number {
  let index = 0;
  while (
    (messages[index] as { role?: unknown } | undefined)?.role ===
    "compactionSummary"
  ) {
    index += 1;
  }
  return index;
}
