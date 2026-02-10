import { ModelMessage } from "ai";
import { RAG_TOOL } from "./constants";
import type { RagChunk } from "./types";

/**
 * Extracts resource IDs from a RagSource (unified extraction logic).
 * Handles both ModelMessage (from messages) and StepResult (from prepareStep).
 */
function extractChunkIdsFromSource(message: ModelMessage): Set<string> {
  // Handle ModelMessage (ToolMessage)
  const chunkIds = new Set<string>();
  if (message.role === "tool" && Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === "tool-result" && part.toolName === RAG_TOOL) {
        const output = part.output;
        // Handle ToolResultOutput ({ type: 'json', value: ... })
        if (
          output &&
          typeof output === "object" &&
          "type" in output &&
          output.type === "json" &&
          "value" in output
        ) {
          const chunks = output.value as RagChunk[];
          for (const chunk of chunks) {
            chunkIds.add(chunk.id);
          }
        }
      }
    }
  }

  return chunkIds;
}

/**
 * Extracts resource IDs from an array of RagSources.
 * Accepts mixed arrays of ModelMessage and StepResult.
 */
export function extractChunkIdsFromMessages(
  messages: ModelMessage[],
): Set<string> {
  return messages.reduce((acc, message) => {
    const ids = extractChunkIdsFromSource(message);
    for (const id of ids) {
      acc.add(id);
    }
    return acc;
  }, new Set<string>());
}
