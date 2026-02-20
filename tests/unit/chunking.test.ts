import { describe, it, expect } from "vitest";
import {
  generateChunks,
  type ChunkGroup,
} from "../../lib/features/rag/ingestion/chunking";

// ─── Constants (mirror of chunking.ts internals) ─────────────────────────────
const MIN_PARENT_SIZE = 2000;
const PARENT_CHUNK_SIZE = 10000;
const HARD_LIMIT = 50000;
const CHILD_CHUNK_SIZE = 600;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a string of roughly `len` chars by repeating `word ` */
function repeat(word: string, len: number): string {
  const unit = word + " ";
  return unit.repeat(Math.ceil(len / unit.length)).slice(0, len);
}

/** Generate a markdown document with multiple sections under heading level h */
function makeSections(count: number, bodySize: number, heading = "#"): string {
  return Array.from(
    { length: count },
    (_, i) => `${heading} Section ${i + 1}\n\n${repeat("content", bodySize)}\n`,
  ).join("\n");
}

// ─── Shared assertion helpers ─────────────────────────────────────────────────

function assertValidChunkGroup(chunk: ChunkGroup) {
  expect(typeof chunk.content).toBe("string");
  expect(chunk.content.length).toBeGreaterThan(0);
  expect(["text", "code"]).toContain(chunk.type);
  expect(Array.isArray(chunk.embeddableContent)).toBe(true);
  expect(chunk.embeddableContent.length).toBeGreaterThan(0);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("generateChunks — public API", () => {
  // ── Empty / trivial input ───────────────────────────────────────────────────

  describe("empty and trivial input", () => {
    it("returns an empty array for an empty string", async () => {
      const chunks = await generateChunks("");
      expect(chunks).toEqual([]);
    });

    it("returns an empty array for whitespace-only input", async () => {
      const chunks = await generateChunks("   \n\n  ");
      expect(chunks).toEqual([]);
    });
  });

  // ── ChunkGroup structure ────────────────────────────────────────────────────

  describe("ChunkGroup structure", () => {
    it("every chunk has content, type, and non-empty embeddableContent", async () => {
      const md = `# Intro\n\n${repeat("word", MIN_PARENT_SIZE + 200)}\n`;
      const chunks = await generateChunks(md);
      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach(assertValidChunkGroup);
    });

    it("text chunks have type 'text'", async () => {
      const md = `# Section\n\n${repeat("hello", MIN_PARENT_SIZE + 200)}\n`;
      const chunks = await generateChunks(md);
      const textChunks = chunks.filter((c) => c.type === "text");
      expect(textChunks.length).toBeGreaterThan(0);
    });

    it("embeddableContent items are at most ~CHILD_CHUNK_SIZE chars (with overlap tolerance)", async () => {
      const md = `# Big\n\n${repeat("word", MIN_PARENT_SIZE + 500)}\n`;
      const chunks = await generateChunks(md);
      for (const chunk of chunks) {
        for (const child of chunk.embeddableContent) {
          expect(child.length).toBeLessThanOrEqual(CHILD_CHUNK_SIZE * 1.5);
        }
      }
    });
  });

  // ── Section grouping via headings ───────────────────────────────────────────

  describe("section grouping via headings", () => {
    it("content without headings produces a single chunk", async () => {
      const chunks = await generateChunks(
        repeat("simple text", MIN_PARENT_SIZE + 200),
      );
      expect(chunks).toHaveLength(1);
    });

    // Two sections that each fit within PARENT_CHUNK_SIZE and together are also
    // within PARENT_CHUNK_SIZE → they all get merged into one chunk.
    it("two small H1 sections that fit within PARENT_CHUNK_SIZE are merged into one chunk", async () => {
      const section = repeat("content", MIN_PARENT_SIZE + 200); // ~2200 chars each
      const md = `# Alpha\n\n${section}\n\n# Beta\n\n${section}`;
      // Combined ~4400 chars < PARENT_CHUNK_SIZE → stays one chunk
      const chunks = await generateChunks(md);
      expect(chunks).toHaveLength(1);
    });

    // Many sections accumulate until the buffer > PARENT_CHUNK_SIZE → flush.
    // 5 sections × ~2500 chars = ~12500 > PARENT_CHUNK_SIZE → produces ≥2 chunks.
    it("many H1 sections flush into multiple chunks once they exceed PARENT_CHUNK_SIZE", async () => {
      const md = makeSections(5, MIN_PARENT_SIZE + 500, "#");
      const chunks = await generateChunks(md);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      chunks.forEach(assertValidChunkGroup);
    });

    it("many H2 sections also flush into multiple chunks", async () => {
      const md = makeSections(5, MIN_PARENT_SIZE + 500, "##");
      const chunks = await generateChunks(md);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it("many H3 sections also flush into multiple chunks", async () => {
      const md = makeSections(5, MIN_PARENT_SIZE + 500, "###");
      const chunks = await generateChunks(md);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it("H4 headings do NOT split sections (treated as part of the same section)", async () => {
      const small = repeat("text", 500);
      const md = `# Main\n\n${small}\n\n#### Sub A\n\n${small}\n\n#### Sub B\n\n${small}`;
      const chunks = await generateChunks(md);
      expect(chunks).toHaveLength(1);
    });
  });

  // ── Buffer accumulation & small-section merging ─────────────────────────────

  describe("buffer accumulation and small-section merging", () => {
    it("a small trailing section (< MIN_PARENT_SIZE) is merged into the previous chunk", async () => {
      const largeBody = repeat("word", MIN_PARENT_SIZE + 500); // >= MIN_PARENT_SIZE
      const smallBody = repeat("short", 300); // < MIN_PARENT_SIZE
      const mdWithSmall = `# Big\n\n${largeBody}\n\n# Small\n\n${smallBody}\n`;
      const mdWithout = `# Big\n\n${largeBody}\n`;

      const chunksWithSmall = await generateChunks(mdWithSmall);
      const chunksWithout = await generateChunks(mdWithout);
      // Small trailing section is merged — same chunk count
      expect(chunksWithSmall).toHaveLength(chunksWithout.length);
    });

    it("two small sections (each < MIN_PARENT_SIZE) accumulate into one chunk", async () => {
      const small = repeat("word", 800); // < MIN_PARENT_SIZE
      const md = `# A\n\n${small}\n\n# B\n\n${small}\n`;
      const chunks = await generateChunks(md);
      expect(chunks).toHaveLength(1);
    });

    it("content at PARENT_CHUNK_SIZE stays as one chunk", async () => {
      const body = repeat("x", PARENT_CHUNK_SIZE - 50);
      const chunks = await generateChunks(`# Section\n\n${body}\n`);
      expect(chunks).toHaveLength(1);
    });
  });

  // ── Oversized content splitting (> HARD_LIMIT) ──────────────────────────────

  describe("oversized content splitting", () => {
    // splitOversizedTextToken is triggered when a single token's raw text > HARD_LIMIT.
    // This produces separate text ChunkGroups.
    it("a single paragraph exceeding HARD_LIMIT is split into multiple text chunks", async () => {
      // Generate a single paragraph token > HARD_LIMIT (50000 chars)
      const body = repeat("word", HARD_LIMIT + 2000);
      const chunks = await generateChunks(body);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      chunks.forEach(assertValidChunkGroup);
      for (const c of chunks) {
        expect(c.type).toBe("text");
      }
    });

    it("many large sections accumulate and produce multiple chunks", async () => {
      // 5 sections × 2500 chars = ~12500 > PARENT_CHUNK_SIZE → triggers flush
      const chunks = await generateChunks(
        makeSections(5, MIN_PARENT_SIZE + 500, "#"),
      );
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      chunks.forEach(assertValidChunkGroup);
    });
  });

  // ── Code block handling ─────────────────────────────────────────────────────

  describe("code block handling", () => {
    it("a fenced code block sets the chunk type to 'code'", async () => {
      const md = `# Example\n\nIntro text.\n\n\`\`\`typescript\nconst x = 1;\n\`\`\`\n`;
      const chunks = await generateChunks(md);
      const codeChunk = chunks.find((c) => c.type === "code");
      expect(codeChunk).toBeDefined();
    });

    it("code chunk content preserves the fenced block markers", async () => {
      const md = `# Example\n\n\`\`\`ts\nfunction hello() { return 'world'; }\n\`\`\`\n`;
      const chunks = await generateChunks(md);
      const codeChunk = chunks.find((c) => c.type === "code");
      expect(codeChunk).toBeDefined();
      expect(codeChunk!.content).toContain("```");
    });

    it("a code block between MIN_PARENT_SIZE and HARD_LIMIT stays in one chunk", async () => {
      // A code block that is large but < HARD_LIMIT → flushed as-is (no split)
      const codeBody = repeat("const x = 1;", PARENT_CHUNK_SIZE + 1000);
      const md = `\`\`\`typescript\n${codeBody}\n\`\`\`\n`;
      const chunks = await generateChunks(md);
      // The code block fits under HARD_LIMIT, no split — stays one chunk
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe("code");
    });

    it("a code block exceeding HARD_LIMIT is split into multiple code chunks", async () => {
      // splitOversizedCodeToken is triggered when tokenText.length > HARD_LIMIT
      const codeBody = repeat("const x = longVarName;", HARD_LIMIT + 2000);
      const md = `\`\`\`typescript\n${codeBody}\n\`\`\`\n`;
      const chunks = await generateChunks(md);
      const codeChunks = chunks.filter((c) => c.type === "code");
      expect(codeChunks.length).toBeGreaterThanOrEqual(2);
    });

    it("split code chunks retain the language field", async () => {
      const codeBody = repeat("const y = 2;", HARD_LIMIT + 2000);
      const md = `\`\`\`typescript\n${codeBody}\n\`\`\`\n`;
      const chunks = await generateChunks(md);
      const codeChunks = chunks.filter((c) => c.type === "code");
      expect(codeChunks.length).toBeGreaterThan(0);
      for (const chunk of codeChunks) {
        expect(chunk.language).toBe("typescript");
      }
    });

    it("unknown code language is handled gracefully", async () => {
      const md = `\`\`\`unknownlang\ndo something;\n\`\`\`\n`;
      await expect(generateChunks(md)).resolves.toBeDefined();
    });
  });

  // ── Language field on oversized code splits ───────────────────────────────────

  describe("language field on oversized code splits", () => {
    // language is populated by splitOversizedCodeToken — only called when
    // a code token's raw text exceeds HARD_LIMIT.
    it.each([
      ["typescript"],
      ["ts"],
      ["javascript"],
      ["js"],
      ["python"],
      ["py"],
    ])(
      "oversized code block with lang '%s' retains language in every split chunk",
      async (lang) => {
        const codeBody = repeat("line;", HARD_LIMIT + 2000);
        const md = `\`\`\`${lang}\n${codeBody}\n\`\`\`\n`;
        const chunks = await generateChunks(md);
        const codeChunks = chunks.filter((c) => c.type === "code");
        expect(codeChunks.length).toBeGreaterThanOrEqual(2);
        for (const c of codeChunks) {
          expect(c.language).toBe(lang);
        }
      },
    );
  });

  // ── title parameter ─────────────────────────────────────────────────────────

  describe("title parameter", () => {
    it("passing a title does not affect chunk content (DEBUG_CHUNKING is off by default)", async () => {
      const md = `# Doc\n\n${repeat("content", MIN_PARENT_SIZE + 200)}\n`;
      const withTitle = await generateChunks(md, "My Document");
      const withoutTitle = await generateChunks(md);
      expect(withTitle.map((c) => c.content)).toEqual(
        withoutTitle.map((c) => c.content),
      );
    });
  });
});
