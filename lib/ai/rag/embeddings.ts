


import { embedMany, embed } from "ai";
import { providers } from "@/lib/ai/models/providers";

export const QUERY_TYPES = ["RETRIEVAL_QUERY", "CODE_RETRIEVAL_QUERY"] as const;
export type QueryType = (typeof QUERY_TYPES)[number];

interface EmbeddingInput {
  chunkId: string;
  content: string;
}

// Nuevo output explícito
interface EmbeddingOutput {
  chunkId: string;
  embedding: number[];
}

export async function generateEmbeddings(
  inputs: EmbeddingInput[]
): Promise<EmbeddingOutput[]> {
  const BATCH_SIZE = 99; // Límite común de APIs
  if (inputs.length === 0) {
    return [];
  }
  console.log("Generating embeddings for", inputs.length, "items");

  const results: EmbeddingOutput[] = [];

  // Procesamos en lotes
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);

    // Solo enviamos el texto al modelo
    const { embeddings } = await embedMany({
      model: providers.embedding(),
      maxParallelCalls: 1,
      providerOptions: {
        google: {
          outputDimensionality: 768,
          taskType: "RETRIEVAL_DOCUMENT",
        },
      },
      values: batch.map((item) => item.content),
    });

    // Mapeamos de vuelta usando la posición en el lote (garantizada por la API de AI SDK)
    // pero vinculando explícitamente al ID del input original.
    const batchResults = batch.map((item, index) => ({
      chunkId: item.chunkId,
      embedding: embeddings[index],
    }));

    results.push(...batchResults);
  }

  return results;
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
