import type { ChatbotMessage } from "@/lib/features/chat/types";
import { RECENT_CONTEXT_MAX_CHARS } from "@/lib/features/chat/mode-routing/questions";
import {
  decideResolvedMode,
  FALLBACK_CHAT_MODE_DECISION,
  isRoutingDecision,
} from "@/lib/features/chat/mode-routing/policy";
import type {
  ChatModeRouterInput,
  ChatModeRouterPort,
  ChatModeRoutingMetadata,
  ResolvedChatMode,
  RoutingDecision,
} from "@/lib/features/chat/mode-routing/types";

export * from "@/lib/features/chat/mode-routing/constants";
export * from "@/lib/features/chat/mode-routing/guards";
export * from "@/lib/features/chat/mode-routing/router";
export * from "@/lib/features/chat/mode-routing/policy";
export * from "@/lib/features/chat/mode-routing/questions";
export * from "@/lib/features/chat/mode-routing/types";

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
 * Neutral, tool-less fallback recorded when routing could not produce a usable
 * decision. Fresh object per call so callers never share mutable state.
 */
const autoFallback = (): ChatModeRoutingMetadata => ({
  ...FALLBACK_CHAT_MODE_DECISION,
  requested: "auto",
});

/**
 * Applies the fallback policy to the classifier answer.
 *
 * Never throws: a broken router (error, timeout, malformed answer) degrades the
 * turn to the neutral branch instead of breaking the chat.
 */
export const resolveChatMode = async (
  port: ChatModeRouterPort,
  input: ChatModeRouterInput,
): Promise<ChatModeRoutingMetadata> => {
  let decision: unknown;
  try {
    decision = await port.route(input);
  } catch (error) {
    console.error("Chat mode routing failed:", error);
    return autoFallback();
  }

  // Provenance (confidence, probabilities, latency…) is only copied when the
  // answer is a well-formed decision; anything else becomes a pure fallback.
  if (!isRoutingDecision(decision)) {
    return autoFallback();
  }

  return {
    ...decision,
    ...decideResolvedMode(decision),
    requested: "auto",
  };
};
