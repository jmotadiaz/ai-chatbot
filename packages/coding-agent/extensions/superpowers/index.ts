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
 * Cadence matches upstream: `session_start` and `session_compact` arm the
 * injection, `agent_end` disarms it, so the bootstrap rides along on the first
 * turn of a session and on the first turn after each compaction.
 *
 * The extension is not loaded for subagent runtimes at all (see
 * `getExtensionPaths({ includeSuperpowersExtension: false })`), so the
 * bootstrap and the 13 skills are orchestrator-only by construction — no
 * `<SUBAGENT-STOP>` block needed.
 */
const EXTREMELY_IMPORTANT_OPEN = "<EXTREMELY_IMPORTANT>";
const EXTREMELY_IMPORTANT_CLOSE = "</EXTREMELY_IMPORTANT>";
/** Idempotency marker: a context already carrying it is never re-injected. */
const BOOTSTRAP_MARKER = "superpowers:using-superpowers bootstrap for pi";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const skillsDir = resolve(extensionDir, "skills");

const BOOTSTRAP_MESSAGE_TEXT = `${EXTREMELY_IMPORTANT_OPEN}
${BOOTSTRAP_MARKER}

${USING_SUPERPOWERS_PROMPT}
${EXTREMELY_IMPORTANT_CLOSE}`;

export default function superpowersExtension(pi: ExtensionAPI): void {
  let injectBootstrap = true;

  pi.on("resources_discover", async () => ({
    skillPaths: [skillsDir],
  }));

  pi.on("session_start", async () => {
    injectBootstrap = true;
  });

  pi.on("session_compact", async () => {
    injectBootstrap = true;
  });

  pi.on("agent_end", async () => {
    injectBootstrap = false;
  });

  pi.on("context", async (event) => {
    if (!injectBootstrap) return;
    if (event.messages.some(messageContainsBootstrap)) return;

    const bootstrapMessage = {
      role: "user" as const,
      content: [{ type: "text" as const, text: BOOTSTRAP_MESSAGE_TEXT }],
      timestamp: Date.now(),
    };

    const insertAt = firstNonCompactionSummaryIndex(event.messages);
    void getTraceLog().then((log) => {
      log?.info("debug.superpowers_bootstrap_injection", {
        mechanism: "context (user message prepend)",
        insertAt,
        messageCount: event.messages.length,
        bootstrapLength: BOOTSTRAP_MESSAGE_TEXT.length,
      });
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

function messageContainsBootstrap(message: unknown): boolean {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content.includes(BOOTSTRAP_MARKER);
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    return (
      part &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string" &&
      (part as { text: string }).text.includes(BOOTSTRAP_MARKER)
    );
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
