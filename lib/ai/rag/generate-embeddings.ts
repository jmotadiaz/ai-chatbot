import { embedMany, embed } from "ai";
import { MarkdownNodeParser } from "@llamaindex/core/node-parser";
import { Document } from "@llamaindex/core/schema";
import pThrottle from "p-throttle";
import { google } from "@/lib/ai/models/definition";

const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");
const MAX_CALLS = 40;
const TIME_WINDOW = 60 * 1000;
const markdownSplitter = new MarkdownNodeParser();

export async function generateMarkdownChunks(text: string): Promise<string[]> {
  const nodes = markdownSplitter.getNodesFromDocuments([
    new Document({ text }),
  ]);
  return nodes.map((node) => node.text.trim()).filter(Boolean);
}

export async function generateEmbeddings(chunks: string[]) {
  if (chunks.length) {
    console.log(`Generating embeddings for ${chunks.length} chunks...`);
    const { embeddings } = await embedMany({
      model: embeddingModel,
      maxParallelCalls: 2,
      providerOptions: {
        google: {
          outputDimensionality: 768,
          taskType: "RETRIEVAL_DOCUMENT",
        },
      },
      values: chunks,
    });

    return embeddings.map((embedding, index) => ({
      content: chunks[index],
      embedding,
    }));
  }

  return [];
}

export const throttledGenerateEmbeddings = pThrottle({
  limit: MAX_CALLS,
  interval: TIME_WINDOW,
})(generateEmbeddings);

export const generateEmbedding = async (value: string): Promise<number[]> => {
  const input = value.replaceAll("\\n", " ");
  const { embedding } = await embed({
    model: embeddingModel,
    providerOptions: {
      google: {
        outputDimensionality: 768,
        taskType: "RETRIEVAL_QUERY",
      },
    },
    value: input,
  });
  return embedding;
};
