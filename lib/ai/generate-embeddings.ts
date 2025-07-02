import { openai } from "@ai-sdk/openai";
import { embedMany, embed } from "ai";

const embeddingModel = openai.embedding("text-embedding-ada-002");

function generateMarkdownChunks(input: string): string[] {
  const chunks: string[] = [];

  // Detectar y procesar bloques de código por separado
  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks = input.match(codeBlockRegex) || [];
  const textWithoutCode = input.replace(codeBlockRegex, "<!CODE_BLOCK!>");

  // Dividir por secciones de encabezados (h1-h5)
  const sections = textWithoutCode.split(/(?=^#{1,5}\s)/gm);

  let codeBlockIndex = 0;

  for (let section of sections) {
    if (section.trim().length === 0) continue;

    // Restaurar bloques de código
    section = section.replace(
      /<!CODE_BLOCK!>/g,
      () => codeBlocks[codeBlockIndex++] || ""
    );

    // Procesar la sección
    if (section.length > 1200) {
      // Dividir secciones largas por párrafos
      const paragraphs = section
        .split(/\n\s*\n/)
        .filter((p) => p.trim().length > 100);
      chunks.push(...paragraphs);
    } else {
      chunks.push(section.trim());
    }
  }

  return chunks.filter((chunk) => chunk.length > 50);
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
