


import { embedMany, embed } from "ai";
import { generateHybridChunks, Chunk  } from "./chunking";
import { providers } from "@/lib/ai/models/providers";

export const QUERY_TYPES = ["RETRIEVAL_QUERY", "CODE_RETRIEVAL_QUERY"] as const;
export type QueryType = (typeof QUERY_TYPES)[number];

export interface Embedding extends Chunk {
  embedding: number[];
}

export async function generateChunks(text: string): Promise<Chunk[]> {
  // Limpieza previa: MDN y docs a veces tienen excesivos saltos de línea
  const cleanText = text.replace(/\n{3,}/g, "\n\n");

  const chunks = await generateHybridChunks(cleanText);
  return chunks;
}

export async function generateEmbeddings(chunks: Chunk[]): Promise<Embedding[]> {
  const BATCH_SIZE = 99;
  if (chunks.length === 0) {
    return [];
  }
  console.log("Generating embeddings for", chunks.length, "chunks");

  const allEmbeddings: Embedding[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const { embeddings } = await embedMany({
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
      parent: chunks[i + index].parent,
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
