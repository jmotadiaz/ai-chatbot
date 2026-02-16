import * as fs from "fs";
import * as path from "path";
import { marked, type Token, type Tokens, type TokensList } from "marked";
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
const MIN_PARENT_SIZE = 2000;
const PARENT_CHUNK_SIZE = 10000;
const HARD_LIMIT = 50000;
const CHILD_CHUNK_SIZE = 600;
const CHILD_OVERLAP = 100;

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

interface Section {
  tokens: Token[];
  rawLength: number;
}

// Function to group tokens into sections based on headings (h1, h2, h3)
function groupTokensIntoSections(tokens: TokensList): Section[] {
  const sections: Section[] = [];
  let currentSection: Section = { tokens: [], rawLength: 0 };

  for (const token of tokens) {
    // If it's a heading of level 1, 2 or 3, start a new section
    if (token.type === "heading" && (token as Tokens.Heading).depth <= 3) {
      if (currentSection.tokens.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { tokens: [token], rawLength: token.raw.length };
    } else {
      currentSection.tokens.push(token);
      currentSection.rawLength += token.raw.length;
    }
  }

  if (currentSection.tokens.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

export async function generateChunks(
  text: string,
  title?: string,
): Promise<ChunkGroup[]> {
  const tokens = marked.lexer(text);
  const sections = groupTokensIntoSections(tokens);
  const chunks: ChunkGroup[] = [];

  let currentBuffer = "";
  let bufferType: "text" | "code" = "text";

  const flushBuffer = async (force: boolean = false) => {
    if (!currentBuffer.trim()) return;

    if (!force && currentBuffer.length < MIN_PARENT_SIZE && chunks.length > 0) {
      const lastChunk = chunks[chunks.length - 1];
      if (lastChunk.content.length + currentBuffer.length <= HARD_LIMIT) {
        lastChunk.content += currentBuffer;
        const children = await childSplitter.createDocuments([
          lastChunk.content,
        ]);
        lastChunk.embeddableContent = children.map((c) => c.pageContent);
        currentBuffer = "";
        bufferType = "text";
        return;
      }
    }

    const childrenDocs = await childSplitter.createDocuments([currentBuffer]);

    chunks.push({
      content: currentBuffer,
      type: bufferType,
      embeddableContent: childrenDocs.map((c) => c.pageContent),
    });

    currentBuffer = "";
    bufferType = "text";
  };

  const processTokens = async (tokensToProcess: Token[]) => {
    for (const token of tokensToProcess) {
      const tokenText = token.raw;

      if (currentBuffer.length + tokenText.length <= PARENT_CHUNK_SIZE) {
        currentBuffer += tokenText;
        if (token.type === "code") bufferType = "code";
      } else if (currentBuffer.length + tokenText.length <= HARD_LIMIT) {
        if (token.type === "code") {
          await flushBuffer(true);
          currentBuffer = tokenText;
          bufferType = "code";
        } else {
          currentBuffer += tokenText;
        }
      } else {
        await flushBuffer(true);

        if (tokenText.length > PARENT_CHUNK_SIZE) {
          if (token.type === "code") {
            const lang = mapLanguage((token as Tokens.Code).lang || "") || "js";
            const codeSplitter = RecursiveCharacterTextSplitter.fromLanguage(
              lang,
              {
                chunkSize: PARENT_CHUNK_SIZE,
                chunkOverlap: 200,
              },
            );

            const codeDocs = await codeSplitter.createDocuments([
              (token as Tokens.Code).text,
            ]);

            for (const doc of codeDocs) {
              const content = `\`\`\`${(token as Tokens.Code).lang || ""}\n${
                doc.pageContent
              }\n\`\`\``;
              const children = await childSplitter.createDocuments([content]);

              chunks.push({
                content: content,
                type: "code",
                language: (token as Tokens.Code).lang,
                embeddableContent: children.map((c) => c.pageContent),
              });
            }
          } else {
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
          currentBuffer = tokenText;
          if (token.type === "code") bufferType = "code";
        }
      }
    }
  };

  for (const section of sections) {
    // If the entire section fits in the current buffer (soft limit), append it
    if (currentBuffer.length + section.rawLength <= PARENT_CHUNK_SIZE) {
      for (const token of section.tokens) {
        currentBuffer += token.raw;
        if (token.type === "code") bufferType = "code";
      }
    }
    // If the entire section doesn't fit in current buffer but is NOT oversized,
    // we flush the current buffer (if large enough) and start a new one with this section.
    else if (section.rawLength <= PARENT_CHUNK_SIZE) {
      // Only flush if the buffer is large enough to stand on its own.
      // If it's too small, carry it forward (prepend it to this section).
      if (currentBuffer.length >= MIN_PARENT_SIZE) {
        await flushBuffer(true);
      }
      // If the buffer was small, it stays in currentBuffer and gets prepended
      // to this section's content naturally.
      for (const token of section.tokens) {
        currentBuffer += token.raw;
        if (token.type === "code") bufferType = "code";
      }
    }
    // If the section itself is oversized (> PARENT_CHUNK_SIZE),
    // we must fall back to token-level processing for this section.
    else {
      // If the buffer is large enough, flush it before processing the oversized section.
      if (currentBuffer.length >= MIN_PARENT_SIZE) {
        await flushBuffer(true);
      }
      // If tiny, carry it forward — processTokens will append to it.
      await processTokens(section.tokens);
    }
  }

  await flushBuffer();

  // Debug functionality: export full resource and chunks to disk
  if (process.env.DEBUG_CHUNKING === "true" && title) {
    try {
      const debugDir = path.join(process.cwd(), "chunks");
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }

      // Sanitize title for filename
      const safeTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();

      // Write full resource
      fs.writeFileSync(path.join(debugDir, `${safeTitle}.md`), text);

      // Write chunks
      chunks.forEach((chunk, index) => {
        fs.writeFileSync(
          path.join(debugDir, `${safeTitle}_chunk_${index}.md`),
          chunk.content,
        );
      });
    } catch (error) {
      console.error("Error writing debug chunks:", error);
    }
  }

  return chunks;
}
