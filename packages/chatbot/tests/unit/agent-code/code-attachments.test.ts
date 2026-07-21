import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  buildUserContent,
  contentToDisplay,
  contentTextLength,
  contentAttachmentCounts,
  totalAttachmentBytes,
  MAX_IMAGE_BYTES,
  MAX_TEXT_FILE_BYTES,
} from "@/lib/features/code/attachments";
import { handleLocalFileUpload } from "@/lib/features/attachment/utils";
import type { FilePart } from "@/lib/features/attachment/types";

const pngDataUrl = "data:image/png;base64,aW1hZ2U=";

describe("buildUserContent / contentToDisplay round-trip", () => {
  it("returns a plain string when there are no files", () => {
    expect(buildUserContent("hello", [])).toBe("hello");
  });

  it("builds an image part from a data-URL FilePart and displays it back", () => {
    const files: FilePart[] = [
      { type: "file", mediaType: "image/png", url: pngDataUrl, filename: "cat.png" },
    ];
    const content = buildUserContent("look at this", files);
    expect(content).toEqual([
      { type: "text", text: "look at this" },
      {
        type: "image",
        source: { type: "data", value: "aW1hZ2U=", mimeType: "image/png" },
        metadata: { filename: "cat.png" },
      },
    ]);

    const display = contentToDisplay(content);
    expect(display.text).toBe("look at this");
    expect(display.files).toEqual([
      { type: "file", mediaType: "image/png", url: pngDataUrl, filename: "cat.png" },
    ]);
  });

  it("builds a document part from a textContent FilePart and displays it back", () => {
    const files: FilePart[] = [
      {
        type: "file",
        mediaType: "text/markdown",
        url: "",
        filename: "notes.md",
        textContent: "# hello",
      },
    ];
    const content = buildUserContent("review this", files);
    expect(Array.isArray(content)).toBe(true);
    const parts = content as Array<Record<string, unknown>>;
    expect(parts[0]).toEqual({ type: "text", text: "review this" });
    expect(parts[1]).toMatchObject({
      type: "document",
      metadata: { filename: "notes.md" },
    });

    const display = contentToDisplay(content);
    expect(display.text).toBe("review this");
    expect(display.files).toEqual([
      {
        type: "file",
        mediaType: "text/markdown",
        url: "",
        filename: "notes.md",
        textContent: "# hello",
      },
    ]);
  });

  it("omits the text part when the typed text is empty but files are present", () => {
    const files: FilePart[] = [
      { type: "file", mediaType: "image/png", url: pngDataUrl, filename: "cat.png" },
    ];
    const content = buildUserContent("", files);
    expect(content).toEqual([
      {
        type: "image",
        source: { type: "data", value: "aW1hZ2U=", mimeType: "image/png" },
        metadata: { filename: "cat.png" },
      },
    ]);
  });

  it("contentToDisplay passes plain string content through unchanged", () => {
    expect(contentToDisplay("hello")).toEqual({ text: "hello", files: [] });
  });

  it("contentToDisplay returns empty text/files for non-string, non-array content", () => {
    expect(contentToDisplay(undefined)).toEqual({ text: "", files: [] });
  });
});

describe("contentTextLength / contentAttachmentCounts", () => {
  it("measures only the typed text, not attachment payloads", () => {
    const content = buildUserContent("hi", [
      { type: "file", mediaType: "image/png", url: pngDataUrl, filename: "cat.png" },
    ]);
    expect(contentTextLength(content)).toBe(2);
    expect(contentTextLength("plain")).toBe(5);
  });

  it("counts images and documents separately", () => {
    const content = buildUserContent("hi", [
      { type: "file", mediaType: "image/png", url: pngDataUrl, filename: "a.png" },
      {
        type: "file",
        mediaType: "text/plain",
        url: "",
        filename: "b.txt",
        textContent: "x",
      },
    ]);
    expect(contentAttachmentCounts(content)).toEqual({ imageCount: 1, documentCount: 1 });
    expect(contentAttachmentCounts("plain")).toEqual({ imageCount: 0, documentCount: 0 });
  });
});

describe("totalAttachmentBytes", () => {
  it("sums decoded byte sizes across images and text files", () => {
    const files: FilePart[] = [
      { type: "file", mediaType: "image/png", url: pngDataUrl, filename: "a.png" }, // "image" -> 5 bytes
      {
        type: "file",
        mediaType: "text/plain",
        url: "",
        filename: "b.txt",
        textContent: "hello", // 5 bytes
      },
    ];
    expect(totalAttachmentBytes(files)).toBe(10);
  });
});

describe("handleLocalFileUpload", () => {
  const originalFileReader = globalThis.FileReader;

  beforeAll(() => {
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsText(file: Blob) {
        void file
          .text()
          .then((text) => {
            this.result = text;
            this.onload?.();
          })
          .catch(() => this.onerror?.());
      }
      readAsDataURL(file: Blob & { type?: string }) {
        void file
          .arrayBuffer()
          .then((buf) => {
            const base64 = Buffer.from(buf).toString("base64");
            this.result = `data:${file.type};base64,${base64}`;
            this.onload?.();
          })
          .catch(() => this.onerror?.());
      }
    }
    // @ts-expect-error test-only global polyfill; Node has no FileReader.
    globalThis.FileReader = MockFileReader;
  });

  afterAll(() => {
    globalThis.FileReader = originalFileReader;
  });

  function fileList(files: File[]): FileList {
    return {
      length: files.length,
      item: (i: number) => files[i] ?? null,
      [Symbol.iterator]: function* () {
        yield* files;
      },
    } as unknown as FileList;
  }

  it("rejects an oversized text file without reading it", async () => {
    const setFiles = vi.fn();
    const onError = vi.fn();
    const big = new File(["x".repeat(10)], "big.md", { type: "text/markdown" });
    Object.defineProperty(big, "size", { value: MAX_TEXT_FILE_BYTES + 1 });

    await handleLocalFileUpload(setFiles, fileList([big]), {
      maxImageBytes: MAX_IMAGE_BYTES,
      maxTextFileBytes: MAX_TEXT_FILE_BYTES,
      onError,
    });

    expect(setFiles).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("big.md"));
  });

  it("rejects an oversized image without reading it", async () => {
    const setFiles = vi.fn();
    const onError = vi.fn();
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: MAX_IMAGE_BYTES + 1 });

    await handleLocalFileUpload(setFiles, fileList([big]), {
      maxImageBytes: MAX_IMAGE_BYTES,
      maxTextFileBytes: MAX_TEXT_FILE_BYTES,
      onError,
    });

    expect(setFiles).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("big.png"));
  });

  it("rejects an unsupported file type", async () => {
    const setFiles = vi.fn();
    const onError = vi.fn();
    const pdf = new File(["x"], "doc.pdf", { type: "application/pdf" });

    await handleLocalFileUpload(setFiles, fileList([pdf]), {
      maxImageBytes: MAX_IMAGE_BYTES,
      maxTextFileBytes: MAX_TEXT_FILE_BYTES,
      onError,
    });

    expect(setFiles).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("doc.pdf"));
  });

  it("accepts a valid text file as a local textContent FilePart (no Blob upload)", async () => {
    const setFiles = vi.fn();
    const md = new File(["# hello"], "notes.md", { type: "text/markdown" });

    await handleLocalFileUpload(setFiles, fileList([md]), {
      maxImageBytes: MAX_IMAGE_BYTES,
      maxTextFileBytes: MAX_TEXT_FILE_BYTES,
    });

    expect(setFiles).toHaveBeenCalledTimes(1);
    const updater = setFiles.mock.calls[0]![0] as (prev: FilePart[]) => FilePart[];
    expect(updater([])).toEqual([
      {
        type: "file",
        mediaType: "text/markdown",
        filename: "notes.md",
        url: "",
        textContent: "# hello",
      },
    ]);
  });

  it("accepts a valid image as a local data-URL FilePart (no Blob upload)", async () => {
    const setFiles = vi.fn();
    const png = new File(["binarydata"], "cat.png", { type: "image/png" });

    await handleLocalFileUpload(setFiles, fileList([png]), {
      maxImageBytes: MAX_IMAGE_BYTES,
      maxTextFileBytes: MAX_TEXT_FILE_BYTES,
    });

    expect(setFiles).toHaveBeenCalledTimes(1);
    const updater = setFiles.mock.calls[0]![0] as (prev: FilePart[]) => FilePart[];
    const [result] = updater([]);
    expect(result!.filename).toBe("cat.png");
    expect(result!.mediaType).toBe("image/png");
    expect(result!.url.startsWith("data:image/png;base64,")).toBe(true);
  });
});
