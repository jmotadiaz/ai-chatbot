import { embedMany, embed } from "ai";
import { openai } from "@/lib/ai/providers";

const embeddingModel = openai.embedding("text-embedding-3-small");

function generateMarkdownChunks(input: string): string[] {
  const chunks: string[] = [];

  const sections = input.split(/(?=^#{1,5}\s)/gm);

  for (const section of sections) {
    if (section.trim().length === 0) continue;

    if (section.length > 1200) {
      const paragraphs = section
        .split(/\n\s*\n/)
        .filter((p) => p.trim().length > 50);
      chunks.push(...paragraphs);
    } else {
      chunks.push(section.trim());
    }
  }

  return chunks;
}

export async function generateMarkdownEmbeddings(value: string) {
  const chunks = generateMarkdownChunks(value);
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: chunks,
  });

  return embeddings.map((embedding, index) => ({
    content: chunks[index],
    embedding,
  }));
}

export const generateEmbedding = async (value: string): Promise<number[]> => {
  const input = value.replaceAll("\\n", " ");
  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
  });
  return embedding;
};
