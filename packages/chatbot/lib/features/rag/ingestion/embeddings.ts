import { embeddingRateLimiter } from "./rate-limiter";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

interface EmbeddingInput {
  chunkId: string;
  content: string;
}

// Explicit new output
interface EmbeddingOutput {
  chunkId: string;
  embedding: number[];
}

export async function generateEmbeddings(
  inputs: EmbeddingInput[],
): Promise<EmbeddingOutput[]> {
  const BATCH_SIZE = 99; // Common API limit
  if (inputs.length === 0) {
    return [];
  }
  console.log("Generating embeddings for", inputs.length, "items");

  const results: EmbeddingOutput[] = [];

  // We process in batches
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);

    // Rate Limiter: Pass the content array directly
    // (internally it concatenates for tokens and uses length for requests)
    const batchContents = batch.map((item) => item.content);

    // We only send the text to the model
    const embeddings = await embeddingRateLimiter.execute(batchContents, () =>
      inferenceKit.embed(batchContents, {
        taskType: "RETRIEVAL_DOCUMENT",
      }),
    );

    // We map back using the position in the batch (guaranteed by the AI SDK API)
    // but explicitly linking to the original input ID.
    const batchResults = batch.map((item, index) => ({
      chunkId: item.chunkId,
      embedding: embeddings[index],
    }));

    results.push(...batchResults);
  }

  return results;
}
