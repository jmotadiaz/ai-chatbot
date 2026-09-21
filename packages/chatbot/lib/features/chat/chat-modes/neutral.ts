import { ToolLoopAgent } from "ai";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import { DEFAULT_PROJECT_AGENT_PROMPT } from "@/lib/features/chat/chat-modes/prompts";

/**
 * Internal branch for turns that need no tool: plain chat, repo-local questions
 * and pasted-text transformations.
 *
 * It is not a selectable Chat Mode. Auto routing reaches it when the classifier
 * answers `neither`, when confidence is below the gate, or when the router
 * fails. Unlike the Context7/RAG/Web branches it declares no tools at all, so
 * the model cannot be forced into an irrelevant lookup, and it answers with the
 * same `ModelConfiguration` the user selected.
 */
export const createNeutralAgent = ({
  modelConfiguration,
}: {
  modelConfiguration: ModelConfiguration;
}) =>
  new ToolLoopAgent({
    ...modelConfiguration,
    instructions: DEFAULT_PROJECT_AGENT_PROMPT,
  });
