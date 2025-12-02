import { marked } from "marked";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { parseCodeAndChunk, createParserFactory, LanguageEnum } from "code-chopper";

export interface ChunkGroup {
  content: string; // Parent content (Context) -> Stored in Chunk table
  type: "text" | "code";
  language?: string;
  boundaryType?: string;
  boundaryName?: string;
  embeddableContent: string[]; // Content to be embedded -> Stored in Embedding table (vectors)
}

const parserFactory = createParserFactory();

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
      const codeChunks = await processCode(token.text, token.lang || "typescript");
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

async function processCode(code: string, language: string): Promise<ChunkGroup[]> {
  try {
    const mappedLang = mapLanguage(language);
    if (!mappedLang) {
       return processText(code);
    }

    const boundaryChunks = await parseCodeAndChunk(code, mappedLang, parserFactory, {});

    if (boundaryChunks.length === 0) {
        return processText(code);
    }

    return boundaryChunks.map((bc) => {
      const type = bc.boundary.type.replace(/_/g, " ");
      const name = bc.boundary.name || "anonymous";
      const injectedContent = `[${type}: ${name}] (${language})\n${bc.content}`;

      return {
        content: bc.content, // The function/class code itself is the parent context
        type: "code",
        language: mappedLang,
        boundaryType: bc.boundary.type,
        boundaryName: bc.boundary.name,
        embeddableContent: [injectedContent],
      };
    });

  } catch (error) {
    console.error("Error processing code chunk:", error);
    return processText(code);
  }
}

function mapLanguage(lang: string): LanguageEnum | null {
  const map: Record<string, LanguageEnum> = {
    ts: "typescript", typescript: "typescript",
    js: "javascript", javascript: "javascript",
    py: "python", python: "python",
    go: "go", rust: "rust", java: "java",
    c: "c", cpp: "cpp", "c++": "cpp",
    cs: "csharp", csharp: "csharp",
    rb: "ruby", ruby: "ruby",
    html: "html", css: "css",
    sh: "bash", bash: "bash", shell: "bash",
  };
  return map[lang.toLowerCase()] || null;
}

export async function generateChunks(text: string): Promise<ChunkGroup[]> {
  // Limpieza previa: MDN y docs a veces tienen excesivos saltos de línea
  const cleanText = text.replace(/\n{3,}/g, "\n\n");

  const chunks = await generateHybridChunks(cleanText);
  return chunks;
}
