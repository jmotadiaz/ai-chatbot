import { describe, it, expect } from "vitest";
import {
  inlineAttachedFiles,
  splitAttachedFiles,
  extractUserContentParts,
} from "../../src/attached-files";

describe("inlineAttachedFiles / splitAttachedFiles round-trip", () => {
  it("returns the text unchanged when there are no docs", () => {
    expect(inlineAttachedFiles("hello", [])).toBe("hello");
  });

  it("inlines a single doc and splits it back out", () => {
    const inlined = inlineAttachedFiles("please review", [
      { filename: "notes.md", mimeType: "text/markdown", content: "# Notes\nhi" },
    ]);
    expect(inlined).toContain("please review");
    expect(inlined).toContain('filename="notes.md"');

    const { text, docs } = splitAttachedFiles(inlined);
    expect(text).toBe("please review");
    expect(docs).toEqual([
      { filename: "notes.md", mimeType: "text/markdown", content: "# Notes\nhi" },
    ]);
  });

  it("inlines and splits multiple docs preserving order", () => {
    const docs = [
      { filename: "a.txt", mimeType: "text/plain", content: "aaa" },
      { filename: "b.json", mimeType: "application/json", content: '{"b":1}' },
    ];
    const inlined = inlineAttachedFiles("two files", docs);
    const result = splitAttachedFiles(inlined);
    expect(result.text).toBe("two files");
    expect(result.docs).toEqual(docs);
  });

  it("handles docs with no typed text", () => {
    const inlined = inlineAttachedFiles("", [
      { filename: "only.txt", mimeType: "text/plain", content: "content" },
    ]);
    const { text, docs } = splitAttachedFiles(inlined);
    expect(text).toBe("");
    expect(docs).toEqual([
      { filename: "only.txt", mimeType: "text/plain", content: "content" },
    ]);
  });

  it("round-trips a filename containing quotes", () => {
    const inlined = inlineAttachedFiles("x", [
      { filename: 'weird "name".txt', mimeType: "text/plain", content: "c" },
    ]);
    const { docs } = splitAttachedFiles(inlined);
    expect(docs[0]!.filename).toBe('weird "name".txt');
  });

  it("leaves text untouched when the closing fence is missing (malformed input)", () => {
    const malformed = 'typed text\n\n<<<ATTACHED_FILE filename="a.txt" mimeType="text/plain">>>\nbody without a closing fence';
    const { text, docs } = splitAttachedFiles(malformed);
    expect(docs).toEqual([]);
    expect(text).toBe(malformed);
  });

  it("does not confuse text that merely contains fence-like substrings without a real block", () => {
    const text = "check out <<<END_ATTACHED_FILE>>> as a marker";
    const { text: out, docs } = splitAttachedFiles(text);
    expect(docs).toEqual([]);
    expect(out).toBe(text);
  });
});

describe("extractUserContentParts", () => {
  it("passes plain string content through as text", () => {
    expect(extractUserContentParts("hello")).toEqual({
      text: "hello",
      images: [],
      docs: [],
    });
  });

  it("returns empty parts for non-string, non-array content", () => {
    expect(extractUserContentParts(undefined)).toEqual({
      text: "",
      images: [],
      docs: [],
    });
    expect(extractUserContentParts(42)).toEqual({ text: "", images: [], docs: [] });
  });

  it("extracts text, image, and document parts from an InputContent[] array", () => {
    const result = extractUserContentParts([
      { type: "text", text: "look at this" },
      {
        type: "image",
        source: { type: "data", value: "aW1hZ2U=", mimeType: "image/png" },
      },
      {
        type: "document",
        source: {
          type: "data",
          value: Buffer.from("file body", "utf8").toString("base64"),
          mimeType: "text/plain",
        },
        metadata: { filename: "doc.txt" },
      },
    ]);

    expect(result.text).toBe("look at this");
    expect(result.images).toEqual([{ data: "aW1hZ2U=", mimeType: "image/png" }]);
    expect(result.docs).toEqual([
      { filename: "doc.txt", mimeType: "text/plain", content: "file body" },
    ]);
  });

  it("strips a data: URL prefix defensively when present on an image source", () => {
    const result = extractUserContentParts([
      {
        type: "image",
        source: {
          type: "data",
          value: "data:image/png;base64,aW1hZ2U=",
          mimeType: "image/png",
        },
      },
    ]);
    expect(result.images).toEqual([{ data: "aW1hZ2U=", mimeType: "image/png" }]);
  });

  it("ignores url-sourced parts (the worker never fetches attachment URLs)", () => {
    const result = extractUserContentParts([
      { type: "image", source: { type: "url", value: "https://example.com/x.png" } },
    ]);
    expect(result.images).toEqual([]);
  });

  it("ignores unknown part types without throwing", () => {
    const result = extractUserContentParts([{ type: "audio", source: { type: "data", value: "x", mimeType: "audio/mp3" } }]);
    expect(result).toEqual({ text: "", images: [], docs: [] });
  });
});
