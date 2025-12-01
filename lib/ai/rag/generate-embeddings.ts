


import { embedMany, embed } from "ai";
import pThrottle from "p-throttle";
import { generateHybridChunks, Chunk  } from "./chunking";
import { providers } from "@/lib/ai/models/providers";


const MAX_CALLS = 50;
const TIME_WINDOW = 60 * 1000;


export const QUERY_TYPES = ["RETRIEVAL_QUERY", "CODE_RETRIEVAL_QUERY"] as const;
export type QueryType = (typeof QUERY_TYPES)[number];

interface Embedding {
  content: string;
  embedding: number[];
  metadata: {
    type: "text" | "code";
    language?: string;
    parent?: string; // Parent content for context
    [key: string]: unknown;
  };
}

const throttledEmbedMany = pThrottle({
  limit: MAX_CALLS,
  interval: TIME_WINDOW,
})(embedMany);

export async function generateChunks(text: string): Promise<Chunk[]> {
  // Limpieza previa: MDN y docs a veces tienen excesivos saltos de línea
  const cleanText = text.replace(/\n{3,}/g, "\n\n");

  const chunks = await generateHybridChunks(cleanText);
  return chunks;
}

export async function generateEmbeddings(chunks: Chunk[]) {
  const BATCH_SIZE = 99;
  if (chunks.length === 0) {
    return [];
  }

  const allEmbeddings: Embedding[] = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const { embeddings } = await throttledEmbedMany({
        model: providers.embedding(),
        maxParallelCalls: 1,
        providerOptions: {
          google: {
            outputDimensionality: 768,
            taskType: "RETRIEVAL_DOCUMENT",
          },
        },
        values: chunks.slice(i, i + BATCH_SIZE).map((c) => c.content),
      });

      allEmbeddings.push(...embeddings.map((embedding, index) => ({
        content: chunks[i + index].content,
        embedding,
        metadata: chunks[i + index].metadata,
      })));
  }

  return allEmbeddings;
}


export const generateEmbedding = async (
  value: string,
  queryType: QueryType
): Promise<number[]> => {
  const input = value.replaceAll("\\n", " ");
  const { embedding } = await embed({
    model: providers.embedding(),
    providerOptions: {
      google: {
        outputDimensionality: 768,
        taskType: queryType,
      },
    },
    value: input,
  });
  return embedding;
};
