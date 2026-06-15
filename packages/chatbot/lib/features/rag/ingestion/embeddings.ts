import { embedMany } from "ai";
import { embeddingRateLimiter } from "./rate-limiter";
import { providers } from "@/lib/infrastructure/ai/providers";

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
  inputs: EmbeddingInput[],
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

    // Rate Limiter: Passa el array de contenidos directamente
    // (internamente concatena para tokens y usa length para requests)
    const batchContents = batch.map((item) => item.content);

    // Solo enviamos el texto al modelo
    const { embeddings } = await embeddingRateLimiter.execute(
      batchContents,
      () =>
        embedMany({
          model: providers.embedding(),
          providerOptions: {
            google: {
              outputDimensionality: 768,
              taskType: "RETRIEVAL_DOCUMENT",
            },
          },
          values: batch.map((item) => item.content),
        }),
    );

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
