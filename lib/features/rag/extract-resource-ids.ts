import { InferUITools, StepResult, ToolSet, ToolUIPart, UIMessage } from "ai";
import { RAG_TOOL } from "./constants";
import type { RagChunk } from "./types";
import type { RagTool } from "./tool";

/**
 * Union type representing possible sources of RAG resource data
 */
type RagSource = ToolUIPart<InferUITools<RagTool>> | StepResult<ToolSet>;

function isToolUIPart(
  source: RagSource,
): source is ToolUIPart<InferUITools<RagTool>> {
  return "output" in source && !("toolResults" in source);
}

function isRagMessagePart(
  part: UIMessage["parts"][number],
): part is ToolUIPart<InferUITools<RagTool>> {
  return part.type === "tool-rag";
}

/**
 * Extracts resource IDs from a RagSource (unified extraction logic).
 * Handles both ToolUIPart (from messages) and StepResult (from prepareStep).
 */
function extractResourceIdsFromSource(source: RagSource): Set<string> {
  if (isToolUIPart(source)) {
    // Handle ToolUIPart from messages
    return (
      source.output?.reduce((acc, resource) => {
        acc.add(resource.id);
        return acc;
      }, new Set<string>()) ?? new Set<string>()
    );
  }

  // Handle StepResult from prepareStep
  if (source.toolResults) {
    const resourceIds = new Set<string>();
    for (const toolResult of source.toolResults) {
      if (toolResult.toolName === RAG_TOOL && toolResult.output) {
        const output = toolResult.output as RagChunk[];
        for (const resource of output) {
          resourceIds.add(resource.id);
        }
      }
    }
    return resourceIds;
  }

  return new Set<string>();
}

/**
 * Extracts resource IDs from an array of RagSources.
 * Accepts mixed arrays of ToolUIPart and StepResult.
 */
export function extractResourceIds(sources: RagSource[]): Set<string> {
  return sources.reduce((acc, source) => {
    for (const id of extractResourceIdsFromSource(source)) {
      acc.add(id);
    }
    return acc;
  }, new Set<string>());
}

/**
 * Extracts resource IDs from UIMessages containing RAG tool parts.
 */
export function extractResourceIdsFromMessages(
  messages: UIMessage[],
): Set<string> {
  const ragParts: ToolUIPart<InferUITools<RagTool>>[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      if (isRagMessagePart(part)) {
        ragParts.push(part);
      }
    }
  }

  return extractResourceIds(ragParts);
}
