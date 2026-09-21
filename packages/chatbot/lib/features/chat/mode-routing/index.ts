import type { ChatbotMessage } from "@/lib/features/chat/types";
import { CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD } from "@/lib/features/chat/mode-routing/constants";
import { RECENT_CONTEXT_MAX_CHARS } from "@/lib/features/chat/mode-routing/questions";
import type {
  ChatModeRouterInput,
  ChatModeRouterPort,
  ChatModeRoutingMetadata,
  ResolvedChatMode,
  RoutingDecision,
} from "@/lib/features/chat/mode-routing/types";

export * from "@/lib/features/chat/mode-routing/constants";
export * from "@/lib/features/chat/mode-routing/questions";
export * from "@/lib/features/chat/mode-routing/types";

/**
 * Ticket 02 shell: there is no real classifier yet, so every Auto turn resolves
 * to the Context7 chat mode and records an explicit `fallback` reason.
 *
 * Ticket 03 replaces this with the neutral branch + real policy and ticket 04
 * with the Jev/OpenRouter adapter.
 */
export const STUB_CHAT_MODE_DECISION: RoutingDecision = {
  mode: "context7",
  reason: "fallback",
  modelId: "stub",
};

export const stubChatModeRouter: ChatModeRouterPort = {
  async route() {
    return { ...STUB_CHAT_MODE_DECISION };
  },
};

const TEST_ROUTER_MODEL_ID = "test-deterministic";

const deterministicDecision = (
  mode: ResolvedChatMode,
  reason: RoutingDecision["reason"],
): RoutingDecision => ({
  mode,
  reason,
  confidence: 0.99,
  modelId: TEST_ROUTER_MODEL_ID,
});

/**
 * Deterministic router for test/e2e mode (no network). It never calls
 * OpenRouter and lets a scenario pick a branch with an explicit marker in the
 * message, so e2e can cover ctx7/web/neutral without the real classifier.
 */
export const createDeterministicChatModeRouter = (): ChatModeRouterPort => ({
  async route({ latestMessage }) {
    const message = latestMessage.toLowerCase();

    if (message.includes("[[route:web]]")) {
      return deterministicDecision("web", "routed");
    }
    if (message.includes("[[route:neutral]]")) {
      return deterministicDecision("neutral", "neither");
    }
    return deterministicDecision("context7", "routed");
  },
});

const messageText = (message: ChatbotMessage): string =>
  message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();

const truncate = (value: string, maxChars: number): string =>
  value.length > maxChars ? value.slice(0, maxChars) : value;

/** Previous turn (user + assistant) as classifier context, truncated per message. */
export const buildChatModeRouterInput = (
  messages: ChatbotMessage[],
): ChatModeRouterInput => {
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  if (lastUserIndex === -1) {
    return { latestMessage: "", recentContext: "" };
  }

  const recentContext = messages
    .slice(0, lastUserIndex)
    .slice(-2)
    .map(
      (message) =>
        `${message.role}: ${truncate(messageText(message), RECENT_CONTEXT_MAX_CHARS)}`,
    )
    .join("\n");

  return {
    latestMessage: messageText(messages[lastUserIndex]),
    recentContext,
  };
};

/**
 * Applies the fallback policy to the classifier answer.
 *
 * Never throws: a broken router degrades the turn instead of breaking the chat.
 */
export const resolveChatMode = async (
  port: ChatModeRouterPort,
  input: ChatModeRouterInput,
): Promise<ChatModeRoutingMetadata> => {
  let decision: RoutingDecision;
  try {
    decision = await port.route(input);
  } catch (error) {
    console.error("Chat mode routing failed:", error);
    return { ...STUB_CHAT_MODE_DECISION, requested: "auto" };
  }

  if (
    decision.mode !== "neutral" &&
    typeof decision.confidence === "number" &&
    decision.confidence < CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD
  ) {
    return { ...decision, mode: "neutral", reason: "low_confidence", requested: "auto" };
  }

  return { ...decision, requested: "auto" };
};
