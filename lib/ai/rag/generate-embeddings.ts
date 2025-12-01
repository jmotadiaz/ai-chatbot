import { embedMany, embed } from "ai";
import { SentenceSplitter } from "@llamaindex/core/node-parser";
import { Document } from "@llamaindex/core/schema";
import pThrottle from "p-throttle";
import { providers } from "@/lib/ai/models/providers";

const MAX_CALLS = 400;
const TIME_WINDOW = 60 * 1000;
const splitter = new SentenceSplitter({
  // Aumentamos a 1024 caracteres (aprox) para capturar explicaciones + bloques de código enteros.
  // 512 suele ser muy poco para documentación técnica densa.
  chunkSize: 1800,
  // Un overlap generoso asegura que si cortamos un método largo,
  // el contexto (nombre de la función) se repita en el siguiente chunk.
  chunkOverlap: 250,
});

export const QUERY_TYPES = ["RETRIEVAL_QUERY", "CODE_RETRIEVAL_QUERY"] as const;
export type QueryType = (typeof QUERY_TYPES)[number];

export async function generateChunks(text: string): Promise<string[]> {
  // Limpieza previa: MDN y docs a veces tienen excesivos saltos de línea
  const cleanText = text.replace(/\n{3,}/g, "\n\n");

  const nodes = await splitter.getNodesFromDocuments([
    new Document({ text: cleanText }),
  ]);
  return nodes.map((node) => node.text.trim()).filter(Boolean);
}
const throttledEmbedMany = pThrottle({
  limit: MAX_CALLS,
  interval: TIME_WINDOW,
})(embedMany);

export async function generateEmbeddings(chunks: string[]) {
  if (chunks.length) {
    const { embeddings } = await throttledEmbedMany({
      model: providers.embedding(),
      maxParallelCalls: 1,
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
