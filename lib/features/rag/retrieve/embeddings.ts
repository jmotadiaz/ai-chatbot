import { embed } from "ai";
import { providers } from "@/lib/ai/providers";
import { QueryType } from "@/lib/features/rag/types";

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
