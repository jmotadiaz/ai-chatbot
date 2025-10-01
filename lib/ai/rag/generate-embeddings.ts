import { embedMany, embed } from "ai";
import { MarkdownNodeParser } from "@llamaindex/core/node-parser";
import { Document } from "@llamaindex/core/schema";
import pThrottle from "p-throttle";
import { google } from "@/lib/ai/models/definition";

const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");
const MAX_CALLS = 90;
const TIME_WINDOW = 60 * 1000;
const MAX_EMBEDDINGS = 99;
const markdownSplitter = new MarkdownNodeParser();

export async function generateMarkdownChunks(text: string): Promise<string[]> {
  const nodes = markdownSplitter.getNodesFromDocuments([
    new Document({ text }),
  ]);
  return nodes.map((node) => node.text.trim()).filter(Boolean);
}

const throttledEmbedMany = pThrottle({
  limit: MAX_CALLS,
  interval: TIME_WINDOW,
})(embedMany);

export async function generateEmbeddings(chunks: string[]) {
  if (chunks.length) {
    const embeddings: Array<number>[] = [];
    for (let i = 0; i < chunks.length; i += MAX_EMBEDDINGS) {
      const chunkGroup = chunks.slice(i, i + MAX_EMBEDDINGS);
      const { embeddings: embeddingsGroup } = await throttledEmbedMany({
        model: embeddingModel,
        maxParallelCalls: 1,
        providerOptions: {
          google: {
            outputDimensionality: 768,
            taskType: "RETRIEVAL_DOCUMENT",
          },
        },
        values: chunkGroup,
      });
      embeddings.push(...embeddingsGroup);
    }

    return embeddings.map((embedding, index) => ({
      content: chunks[index],
      embedding,
    }));
  }

  return [];
}

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
