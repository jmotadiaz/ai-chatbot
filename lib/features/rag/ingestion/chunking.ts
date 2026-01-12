import { marked } from "marked";
import {
  RecursiveCharacterTextSplitter,
  SupportedTextSplitterLanguages,
} from "@langchain/textsplitters";

export interface ChunkGroup {
  content: string;
  type: "text" | "code"; // Tipo predominante
  language?: string;
  embeddableContent: string[];
}

type SupportedLanguages = (typeof SupportedTextSplitterLanguages)[number];

// Cohere rerank-v3.5 supports up to 4096 tokens (~14-16K chars)
// Using aggressive limits to maximize context per chunk
const MIN_PARENT_SIZE = 500; // Minimum size to avoid tiny useless chunks
const PARENT_CHUNK_SIZE = 8000; // ~2000 tokens - good balance
const HARD_LIMIT = 12000; // ~3000 tokens - max before forcing split
const CHILD_CHUNK_SIZE = 400;
const CHILD_OVERLAP = 50;

// Splitter para generar los hijos (vectores de búsqueda)
const childSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHILD_CHUNK_SIZE,
  chunkOverlap: CHILD_OVERLAP,
});

// Función auxiliar para mapear lenguajes para LangChain
const mapLanguage = (lang: string): SupportedLanguages | undefined => {
  const map: Record<string, SupportedLanguages> = {
    ts: "js",
    typescript: "js",
    js: "js",
    javascript: "js",
    py: "python",
    python: "python",
    go: "go",
    java: "java",
    cpp: "cpp",
    "c++": "cpp",
    html: "html",
    php: "php",
    rust: "rust",
  };
  return map[lang.toLowerCase()];
};

export async function generateChunks(text: string): Promise<ChunkGroup[]> {
  // 1. Tokenizar con marked para detectar bloques
  const tokens = marked.lexer(text);
  const chunks: ChunkGroup[] = [];

  // Buffer para acumular contenido hasta llegar a PARENT_CHUNK_SIZE
  let currentBuffer = "";
  let bufferType: "text" | "code" = "text"; // Predeterminado

  // Función para procesar y vaciar el buffer actual
  const flushBuffer = async (force: boolean = false) => {
    if (!currentBuffer.trim()) return;

    // Si el buffer es muy pequeño, intentar fusionarlo con el último chunk
    if (!force && currentBuffer.length < MIN_PARENT_SIZE && chunks.length > 0) {
      const lastChunk = chunks[chunks.length - 1];
      // Fusionar si el resultado no excede el hard limit
      if (lastChunk.content.length + currentBuffer.length <= HARD_LIMIT) {
        lastChunk.content += currentBuffer;
        // Regenerar embeddings del chunk fusionado
        const children = await childSplitter.createDocuments([
          lastChunk.content,
        ]);
        lastChunk.embeddableContent = children.map((c) => c.pageContent);
        currentBuffer = "";
        bufferType = "text";
        return;
      }
    }

    // Generamos hijos pequeños para el vector search
    const childrenDocs = await childSplitter.createDocuments([currentBuffer]);

    chunks.push({
      content: currentBuffer, // El padre grande (~8000 chars)
      type: bufferType,
      embeddableContent: childrenDocs.map((c) => c.pageContent),
    });

    currentBuffer = "";
    bufferType = "text"; // Reset
  };

  for (const token of tokens) {
    const tokenText = token.raw;

    // CASO A: El token cabe en el buffer actual (soft limit)
    if (currentBuffer.length + tokenText.length <= PARENT_CHUNK_SIZE) {
      currentBuffer += tokenText;
      // Si entra código, marcamos el buffer como mixto/código si es relevante
      if (token.type === "code") bufferType = "code";
    }
    // CASO B: Excede soft limit pero cabe en hard limit - permitir flexibilidad
    // EXCEPCIÓN: Si es un code block, lo movemos al siguiente chunk para mantener integridad
    else if (currentBuffer.length + tokenText.length <= HARD_LIMIT) {
      if (token.type === "code") {
        // Flush el buffer actual y empezar nuevo chunk con el code block
        await flushBuffer(true);
        currentBuffer = tokenText;
        bufferType = "code";
      } else {
        // Para texto normal, permitimos flexibilidad hasta el hard limit
        currentBuffer += tokenText;
      }
    }
    // CASO C: El token desborda el hard limit
    else {
      // 1. Guardamos lo que ya teníamos acumulado (forzar flush)
      await flushBuffer(true);

      // 2. Analizamos el token nuevo que provocó el desborde
      // ¿Es este token individual MÁS GRANDE que el límite máximo?
      if (tokenText.length > PARENT_CHUNK_SIZE) {
        // Es un bloque gigante (ej: un archivo de código de 500 líneas).
        // AQUI SÍ debemos dividirlo forzosamente, pero usamos un splitter inteligente.
        if (token.type === "code") {
          const lang = mapLanguage(token.lang || "") || "js";
          const codeSplitter = RecursiveCharacterTextSplitter.fromLanguage(
            lang,
            {
              chunkSize: PARENT_CHUNK_SIZE,
              chunkOverlap: 200,
            }
          );

          const codeDocs = await codeSplitter.createDocuments([token.text]);

          for (const doc of codeDocs) {
            // Tratamos cada sub-fragmento como un parent independiente
            // Reconstruimos el bloque de código md para mantener formato si queremos
            // o guardamos el contenido raw. Para RAG de código, raw suele ser mejor.
            const content = `\`\`\`${token.lang || ""}\n${
              doc.pageContent
            }\n\`\`\``;
            const children = await childSplitter.createDocuments([content]);

            chunks.push({
              content: content,
              type: "code",
              language: token.lang,
              embeddableContent: children.map((c) => c.pageContent),
            });
          }
        } else {
          // Es texto plano gigante
          const textDocs = await new RecursiveCharacterTextSplitter({
            chunkSize: PARENT_CHUNK_SIZE,
            chunkOverlap: 200,
          }).createDocuments([tokenText]);

          for (const doc of textDocs) {
            const children = await childSplitter.createDocuments([
              doc.pageContent,
            ]);
            chunks.push({
              content: doc.pageContent,
              type: "text",
              embeddableContent: children.map((c) => c.pageContent),
            });
          }
        }
      } else {
        // El token no es gigante, solo no cabía en el anterior.
        // Iniciamos el buffer nuevo con este token.
        currentBuffer = tokenText;
        if (token.type === "code") bufferType = "code";
      }
    }
  }

  // Vaciar cualquier remanente final
  await flushBuffer();

  return chunks;
}
