import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
import { QueryType } from "@/lib/features/rag/types";

export const generateEmbeddings = async (
  values: string[],
  queryType: QueryType,
): Promise<number[][]> => {
  const inputs = values.map((v) => v.replaceAll("\\n", " "));
  return inferenceKit.embed("embedding", inputs, { taskType: queryType });
};
