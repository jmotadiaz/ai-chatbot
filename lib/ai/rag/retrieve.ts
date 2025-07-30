import { generateText } from "ai";
import { generateEmbedding } from "@/lib/ai/rag/generate-embeddings";
import { findSimilarChunks, SimilarChunks } from "@/lib/db/queries";
import { languageModelConfigurations } from "@/lib/ai/models";

export interface RetrieveResult {
  success: boolean;
  similarChunks?: SimilarChunks;
  resources?: string[];
  error?: string;
}

/**
 * Translates text to English using Gemini 2.0 Flash
 */
export async function translateToEnglish(text: string): Promise<string> {
  try {
    const { text: translatedText } = await generateText({
      ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
      system: `You are an expert from any language to English translator. Only return the translation, no explanations`,
      prompt: `Translate the following text to English: ${text}`,
    });
    return translatedText.trim();
  } catch (error) {
    console.error("Translation failed:", error);
    return text;
  }
}

/**
 * Retrieves relevant context from RAG database for a given query
 */
export async function retrieve(
  query: string,
  limit: number = 6
): Promise<RetrieveResult> {
  try {
    const userQueryEmbedded = await generateEmbedding(query);
    const similarChunks = await findSimilarChunks(userQueryEmbedded, limit);

    if (similarChunks.length === 0) {
      return {
        success: false,
        error: "No relevant context found in knowledge base",
      };
    }

    return {
      success: true,
      similarChunks,
      resources: [
        ...new Set(similarChunks.map(({ resourceTitle }) => resourceTitle)),
      ],
    };
  } catch (error) {
    console.error("Error in retrieve function:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error in retrieve function",
    };
  }
}

export function buildContextPrompt(similarChunks: SimilarChunks): string {
  const contextSections = similarChunks
    .map((chunk, index) => {
      return `
      ## Context ${index + 1} (from "${chunk.resourceTitle}", similarity: ${(
        chunk.similarity * 100
      ).toFixed(1)}%)
      ${chunk.content}
      `;
    })
    .join("\n");

  return `# PRIORITY CONTEXT FOR USER QUERY

    The following information from your knowledge base is highly relevant to the user's question. Use this context as your primary source of information when responding. If the context doesn't contain enough information to fully answer the question, you may supplement with your general knowledge, but prioritize the provided context.

    ${contextSections}

    ---

    Please answer the user's question using the above context as your primary reference.`;
}
