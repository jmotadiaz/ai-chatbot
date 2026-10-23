import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  handleFileUpload,
  handleLocalFileUpload,
} from "@/lib/features/attachment/utils";
import type { FilePart } from "@/lib/features/attachment/types";

/**
 * `input.files` is a *live* list. Any consumer that awaits between reads (a
 * `FileReader`, for one) keeps iterating the same list, so a caller that
 * clears the input — `e.target.value = ""`, or the menu unmounting the
 * input — truncates the iteration to the files read before that point.
 *
 * This mock models exactly that: every `next()` re-reads the current
 * backing array, and `clear()` empties it like the platform does.
 */
function liveFileList(initial: File[]) {
  let current = [...initial];
  const list = {
    get length() {
      return current.length;
    },
    item: (index: number) => current[index] ?? null,
    clear: () => {
      current = [];
    },
    [Symbol.iterator]: () => {
      let index = 0;
      return {
        next: (): IteratorResult<File> => {
          const file = current[index];
          index += 1;
          return file ? { value: file, done: false } : { value: undefined, done: true };
        },
        [Symbol.iterator]() {
          return this;
        },
      };
    },
  };
  return list as unknown as FileList & { clear: () => void };
}

function filePartUpdater(
  setFiles: ReturnType<typeof vi.fn>,
  call = 0,
): ((prev: FilePart[]) => FilePart[]) {
  return setFiles.mock.calls[call]![0] as (prev: FilePart[]) => FilePart[];
}

describe("attachment uploads keep every file in a live FileList", () => {
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

  it("handleLocalFileUpload reads all files even if the input is cleared right after the change event", async () => {
    const files = [
      new File(["# one"], "one.md", { type: "text/markdown" }),
      new File(["# two"], "two.md", { type: "text/markdown" }),
      new File(["binary"], "three.png", { type: "image/png" }),
    ];
    const fileList = liveFileList(files);
    const setFiles = vi.fn();

    // The coding agent handler resets `e.target.value` synchronously, which
    // empties `input.files` while the reads are still in flight.
    const upload = handleLocalFileUpload(setFiles, fileList, {
      maxImageBytes: 1024 * 1024,
      maxTextFileBytes: 1024 * 1024,
    });
    fileList.clear();
    await upload;

    const uploaded = setFiles.mock.calls
      .map((_call, index) => filePartUpdater(setFiles, index)([]))
      .flat();
    expect(uploaded.map((file) => file.filename)).toEqual([
      "one.md",
      "two.md",
      "three.png",
    ]);
  });

  it("handleFileUpload reads all files even if the menu unmounts the input right after the change event", async () => {
    const files = [
      new File(["# one"], "one.md", { type: "text/markdown" }),
      new File(["# two"], "two.md", { type: "text/markdown" }),
      new File(["binary"], "three.png", { type: "image/png" }),
    ];
    const fileList = liveFileList(files);
    const setFiles = vi.fn();

    const upload = handleFileUpload(setFiles, fileList, ["img", "pdf"]);
    fileList.clear();
    await upload;

    const uploaded = setFiles.mock.calls
      .map((_call, index) => filePartUpdater(setFiles, index)([]))
      .flat();
    expect(uploaded.map((file) => file.filename)).toEqual([
      "one.md",
      "two.md",
      "three.png",
    ]);
  });
});
