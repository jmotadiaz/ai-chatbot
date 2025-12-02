import { marked } from "marked";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { parseCodeAndChunk, createParserFactory, LanguageEnum } from "code-chopper";

export interface Chunk {
  content: string;
  parent: string;
  metadata: {
    type: "text" | "code";
    language?: string;
    boundary?: unknown; // Para chunks de código
    [key: string]: unknown;
  };
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

export async function generateHybridChunks(text: string): Promise<Chunk[]> {
  const tokens = marked.lexer(text);
  const chunks: Chunk[] = [];

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

async function processText(text: string): Promise<Chunk[]> {
  // Paso 1: Generar Documentos Padre (Contexto)
  const parents = await parentSplitter.createDocuments([text]);

  const chunks: Chunk[] = [];

  for (const parent of parents) {
    // Paso 2: Generar Documentos Hijos (Índice) desde el Padre
    const children = await childSplitter.createDocuments([parent.pageContent]);

    children.forEach((child) => {
      // CORRECCIÓN: No inyectamos contexto en 'content'.
      // El 'content' debe ser limpio para que el vector sea preciso.
      chunks.push({
        content: child.pageContent,
        parent: parent.pageContent,
        metadata: {
          type: "text",
          // Guardamos el padre completo. Al recuperar, decidirás si usas
          // el child (para citar) o el parent (para razonar).
        },
      });
    });
  }

  return chunks;
}

async function processCode(code: string, language: string): Promise<Chunk[]> {
  try {
    const mappedLang = mapLanguage(language);
    if (!mappedLang) {
       return processText(code);
    }

    const boundaryChunks = await parseCodeAndChunk(code, mappedLang, parserFactory, {});

    return boundaryChunks.map((bc) => {
      // Para código, SI mantenemos cierta inyección de metadatos en el contenido
      // porque un trozo de código sin su nombre de función pierde significado semántico.
      const type = bc.boundary.type.replace(/_/g, " ");
      const name = bc.boundary.name || "anonymous";
      const injectedContent = `[${type}: ${name}] (${language})\n${bc.content}`;

      return {
        content: injectedContent,
        parent: code,
        metadata: {
          type: "code",
          language: mappedLang,
          boundary: bc.boundary,
          // En código, el "padre" podría ser el archivo entero o el bloque,
          // aquí simplificamos manteniendo el boundary como contexto específico.
        },
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
