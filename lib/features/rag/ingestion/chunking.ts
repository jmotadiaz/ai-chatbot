import * as fs from "fs";
import * as path from "path";
import { marked, type Token, type Tokens, type TokensList } from "marked";
import {
  RecursiveCharacterTextSplitter,
  SupportedTextSplitterLanguages,
} from "@langchain/textsplitters";

export interface ChunkGroup {
  content: string;
  type: "text" | "code"; // Predominant type
  language?: string;
  embeddableContent: string[];
}

type SupportedLanguage = (typeof SupportedTextSplitterLanguages)[number];

// Cohere rerank-v3.5 supports up to 4096 tokens (~14-16K chars)
const MIN_PARENT_SIZE = 2000;
const PARENT_CHUNK_SIZE = 10000;
const HARD_LIMIT = 50000;
const CHILD_CHUNK_SIZE = 600;
const CHILD_OVERLAP = 100;
const SPLIT_OVERLAP = 200;

const childSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHILD_CHUNK_SIZE,
  chunkOverlap: CHILD_OVERLAP,
});

const LANGUAGE_MAP: Record<string, SupportedLanguage> = {
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

const mapLanguage = (lang: string): SupportedLanguage | undefined =>
  LANGUAGE_MAP[lang.toLowerCase()];

interface Section {
  tokens: Token[];
  rawLength: number;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateChunks(
  text: string,
  title?: string,
): Promise<ChunkGroup[]> {
  const tokens = marked.lexer(text);
  const sections = groupTokensIntoSections(tokens);
  const chunks: ChunkGroup[] = [];

  let currentBuffer = "";
  let bufferType: "text" | "code" = "text";

  const resetBuffer = () => {
    currentBuffer = "";
    bufferType = "text";
  };

  const mergeIntoLastChunk = async () => {
    const lastChunk = chunks[chunks.length - 1];
    lastChunk.content += currentBuffer;
    lastChunk.embeddableContent = await createChildChunks(lastChunk.content);
    resetBuffer();
  };

  const flushAsNewChunk = async () => {
    chunks.push({
      content: currentBuffer,
      type: bufferType,
      embeddableContent: await createChildChunks(currentBuffer),
    });
    resetBuffer();
  };

  const flushBuffer = async (mustFlush = false) => {
    if (!currentBuffer.trim()) return;

    const isSmallBuffer = currentBuffer.length < MIN_PARENT_SIZE;
    const hasPreviousChunk = chunks.length > 0;

    if (!mustFlush && isSmallBuffer && hasPreviousChunk) {
      const mergedLength =
        chunks[chunks.length - 1].content.length + currentBuffer.length;
      if (mergedLength <= HARD_LIMIT) {
        await mergeIntoLastChunk();
        return;
      }
    }

    await flushAsNewChunk();
  };

  for (const section of sections) {
    const sectionFitsInBuffer =
      currentBuffer.length + section.rawLength <= PARENT_CHUNK_SIZE;
    const sectionIsOversized = section.rawLength > PARENT_CHUNK_SIZE;

    if (sectionFitsInBuffer) {
      appendTokensToBuffer(section.tokens);
    } else if (!sectionIsOversized) {
      if (currentBuffer.length >= MIN_PARENT_SIZE) {
        await flushBuffer(true);
      }
      appendTokensToBuffer(section.tokens);
    } else {
      if (currentBuffer.length >= MIN_PARENT_SIZE) {
        await flushBuffer(true);
      }
      await processTokens(section.tokens);
    }
  }

  await flushBuffer();
  await writeDebugChunks(text, title, chunks);

  return chunks;

  function appendTokensToBuffer(tokens: Token[]) {
    for (const token of tokens) {
      currentBuffer += token.raw;
      if (token.type === "code") bufferType = "code";
    }
  }

  async function processTokens(tokensToProcess: Token[]) {
    for (const token of tokensToProcess) {
      const tokenText = token.raw;
      const fitsInBuffer =
        currentBuffer.length + tokenText.length <= PARENT_CHUNK_SIZE;
      const fitsUnderHardLimit =
        currentBuffer.length + tokenText.length <= HARD_LIMIT;

      if (fitsInBuffer) {
        currentBuffer += tokenText;
        if (token.type === "code") bufferType = "code";
      } else if (fitsUnderHardLimit) {
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
          const newChunks =
            token.type === "code"
              ? await splitOversizedCodeToken(token as Tokens.Code)
              : await splitOversizedTextToken(tokenText);
          chunks.push(...newChunks);
        } else {
          currentBuffer = tokenText;
          if (token.type === "code") bufferType = "code";
        }
      }
    }
  }
}

// ─── Private Helpers ─────────────────────────────────────────────────────────

function groupTokensIntoSections(tokens: TokensList): Section[] {
  const sections: Section[] = [];
  let currentSection: Section = { tokens: [], rawLength: 0 };

  for (const token of tokens) {
    const isTopLevelHeading =
      token.type === "heading" && (token as Tokens.Heading).depth <= 3;

    if (isTopLevelHeading) {
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

async function createChildChunks(content: string): Promise<string[]> {
  const docs = await childSplitter.createDocuments([content]);
  return docs.map((doc) => doc.pageContent);
}

async function splitOversizedCodeToken(
  token: Tokens.Code,
): Promise<ChunkGroup[]> {
  const lang = mapLanguage(token.lang || "") ?? "js";
  const codeSplitter = RecursiveCharacterTextSplitter.fromLanguage(lang, {
    chunkSize: PARENT_CHUNK_SIZE,
    chunkOverlap: SPLIT_OVERLAP,
  });

  const codeDocs = await codeSplitter.createDocuments([token.text]);

  return Promise.all(
    codeDocs.map(async (doc) => {
      const content = `\`\`\`${token.lang || ""}\n${doc.pageContent}\n\`\`\``;
      return {
        content,
        type: "code" as const,
        language: token.lang,
        embeddableContent: await createChildChunks(content),
      };
    }),
  );
}

async function splitOversizedTextToken(
  tokenText: string,
): Promise<ChunkGroup[]> {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: PARENT_CHUNK_SIZE,
    chunkOverlap: SPLIT_OVERLAP,
  });

  const textDocs = await textSplitter.createDocuments([tokenText]);

  return Promise.all(
    textDocs.map(async (doc) => ({
      content: doc.pageContent,
      type: "text" as const,
      embeddableContent: await createChildChunks(doc.pageContent),
    })),
  );
}

// Only writes when DEBUG_CHUNKING=true is set in the environment.
async function writeDebugChunks(
  text: string,
  title: string | undefined,
  chunks: ChunkGroup[],
) {
  if (process.env.DEBUG_CHUNKING !== "true" || !title) return;

  try {
    const debugDir = path.join(process.cwd(), "chunks");
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }

    const safeTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();

    fs.writeFileSync(path.join(debugDir, `${safeTitle}.md`), text);

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
