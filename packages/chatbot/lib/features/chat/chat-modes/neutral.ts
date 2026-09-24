import type { ChatAgentAiPort } from "@/lib/features/chat/conversation/ports";
import { DEFAULT_PROJECT_AGENT_PROMPT } from "@/lib/features/chat/chat-modes/prompts";

/**
 * Internal branch for turns that need no tool: plain chat, repo-local questions
 * and pasted-text transformations.
 *
 * It is not a selectable Chat Mode. Auto routing reaches it when the classifier
 * answers `neither`, when confidence is below the gate, or when the router
 * fails. Unlike the Context7/RAG/Web branches it declares no tools at all, so
 * the model cannot be forced into an irrelevant lookup, and it answers with
 * the same user-selected model, built through the kit's `createAgent`.
 */
export const createNeutralAgent = ({ ai }: { ai: ChatAgentAiPort }) =>
  ai.createAgent({ instructions: DEFAULT_PROJECT_AGENT_PROMPT });
