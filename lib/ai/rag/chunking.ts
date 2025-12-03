import { marked } from "marked";
import {
  RecursiveCharacterTextSplitter,
  SupportedTextSplitterLanguages,
} from "@langchain/textsplitters";

export interface ChunkGroup {
  content: string; // Parent content (Context) -> Stored in Chunk table
  type: "text" | "code";
  language?: string;
  boundaryType?: string;
  boundaryName?: string;
  embeddableContent: string[]; // Content to be embedded -> Stored in Embedding table (vectors)
}

export type SupportedLanguage = (typeof SupportedTextSplitterLanguages)[number];

// 1. Splitter Padre: Define la "Ventana de Contexto" para el LLM.
// Mantenemos 2000 caracteres, que es un buen tamaño para pasar al LLM como respuesta.
const parentSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 2000,
  chunkOverlap: 200,
});

// 2. Splitter Hijo: Define la "Precisión de Búsqueda".
// 400 caracteres es ideal para que el embedding capture una idea específica sin ruido.
const childSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 400,
  chunkOverlap: 50,
});

const mapLanguage = (lang: string): SupportedLanguage | null => {
  const normalized = lang.toLowerCase();

  const map: Record<string, SupportedLanguage> = {
    ts: "js",
    typescript: "js", // LangChain usa 'js' para TS también
    js: "js",
    javascript: "js",
    py: "python",
    python: "python",
    go: "go",
    java: "java",
    cpp: "cpp",
    "c++": "cpp",
    rb: "ruby",
    ruby: "ruby",
    html: "html",
    php: "php",
    rust: "rust",
    // Puedes añadir más según la documentación de LangChain
  };

  return map[normalized] || null;
};

async function generateHybridChunks(text: string): Promise<ChunkGroup[]> {
  const tokens = marked.lexer(text);
  const chunks: ChunkGroup[] = [];

  let currentTextBuffer = "";

  for (const token of tokens) {
    if (token.type === "code") {
      // Si encontramos código, procesamos el texto acumulado hasta ahora
      if (currentTextBuffer.trim()) {
        const textChunks = await processText(currentTextBuffer);
        chunks.push(...textChunks);
        currentTextBuffer = "";
      }

      // Procesamos el bloque de código independientemente
      const codeChunks = await processCode(
        token.text,
        token.lang || "typescript"
      );
      chunks.push(...codeChunks);
    } else {
      if (token.raw) {
        currentTextBuffer += token.raw;
      }
    }
  }

  // Procesar cualquier texto restante al final del archivo
  if (currentTextBuffer.trim()) {
    const textChunks = await processText(currentTextBuffer);
    chunks.push(...textChunks);
  }

  return chunks;
}

async function processText(text: string): Promise<ChunkGroup[]> {
  // Paso 1: Generar Documentos Padre (Contexto)
  const parents = await parentSplitter.createDocuments([text]);

  const chunks: ChunkGroup[] = [];

  for (const parent of parents) {
    // Paso 2: Generar Documentos Hijos (Índice) desde el Padre
    const children = await childSplitter.createDocuments([parent.pageContent]);

    chunks.push({
      content: parent.pageContent,
      type: "text",
      embeddableContent: children.map((child) => child.pageContent),
    });
  }

  return chunks;
}

async function processCode(
  code: string,
  language: string
): Promise<ChunkGroup[]> {
  try {
    const mappedLang = mapLanguage(language);

    // Si el lenguaje no es soportado por LangChain, lo tratamos como texto normal
    if (!mappedLang) {
      return processText(code);
    }

    // 1. Splitter INTELIGENTE (Code-Aware)
    // Cortará preferentemente en definiciones de clases/funciones
    const parentSplitter = RecursiveCharacterTextSplitter.fromLanguage(
      mappedLang,
      {
        chunkSize: 2000,
        chunkOverlap: 200,
      }
    );

    // 2. Splitter Hijo (Para embeddings pequeños dentro del bloque de código)
    const childSplitter = RecursiveCharacterTextSplitter.fromLanguage(
      mappedLang,
      {
        chunkSize: 400,
        chunkOverlap: 50,
      }
    );

    const parentDocs = await parentSplitter.createDocuments([code]);
    const chunks: ChunkGroup[] = [];

    for (const parent of parentDocs) {
      // Estrategia Small-to-Big dentro del código:
      // Dividimos el bloque grande (función/clase) en trozos pequeños para el vector search
      const childDocs = await childSplitter.createDocuments([
        parent.pageContent,
      ]);

      // Inyectamos una cabecera simple para dar contexto al embedding huérfano
      const embeddableContent = childDocs.map(
        (child) => `[${mappedLang} snippet]\n${child.pageContent}`
      );

      chunks.push({
        content: parent.pageContent, // El LLM recibe el bloque completo
        type: "code",
        language: mappedLang,
        embeddableContent: embeddableContent,
      });
    }

    return chunks;
  } catch (error) {
    console.error("Error processing code chunk:", error);
    return processText(code);
  }
}

export async function generateChunks(text: string): Promise<ChunkGroup[]> {
  // Limpieza previa: MDN y docs a veces tienen excesivos saltos de línea
  const cleanText = text.replace(/\n{3,}/g, "\n\n");

  const chunks = await generateHybridChunks(cleanText);
  return chunks;
}
