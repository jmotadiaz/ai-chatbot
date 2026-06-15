import { embedMany } from "ai";
import { providers } from "@/lib/infrastructure/ai/providers";
import { QueryType } from "@/lib/features/rag/types";

export const generateEmbeddings = async (
  values: string[],
  queryType: QueryType,
): Promise<number[][]> => {
  const inputs = values.map((v) => v.replaceAll("\\n", " "));
  const { embeddings } = await embedMany({
    model: providers.embedding(),
    providerOptions: {
      google: {
        outputDimensionality: 768,
        taskType: queryType,
      },
    },
    values: inputs,
  });
  return embeddings;
};
