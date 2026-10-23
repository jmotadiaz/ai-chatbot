import type { FilePart } from "./types";
import type { ChatModelConfiguration } from "@/lib/features/foundation-model/config";

export const convertFilesToDataURLs = async (
  files: FileList
): Promise<FilePart[]> => {
  return Promise.all(Array.from(files).map(convertFileToDataURLs));
};

export const convertFileToDataURLs = async (file: File): Promise<FilePart> => {
  return new Promise<FilePart>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        type: "file",
        mediaType: file.type,
        filename: file.name,
        url: reader.result as string,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const readTextFile = async (file: File): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

const isTextFile = (filename: string): boolean => {
  const extension = filename.split(".").pop()?.toLowerCase();
  return (
    extension === "md" ||
    extension === "txt" ||
    extension === "xml" ||
    extension === "json"
  );
};

export const toFilePart = (
  blob: { url: string },
  originalFile: File
): FilePart => {
  return {
    filename: originalFile.name,
    type: "file",
    mediaType: originalFile.type,
    url: blob.url,
  };
};

export interface HandleLocalFileUploadOptions {
  maxImageBytes: number;
  maxTextFileBytes: number;
  onError?: (message: string) => void;
}

/**
 * Like `handleFileUpload`, but never uploads to Vercel Blob: images stay as
 * local data URLs and text files stay as inline `textContent`. Used by the
 * coding agent, whose worker needs attachments as base64 payloads rather
 * than fetchable URLs.
 */
export const handleLocalFileUpload = async (
  setFiles: React.Dispatch<React.SetStateAction<FilePart[]>>,
  fileList: FileList | null,
  options: HandleLocalFileUploadOptions,
): Promise<void> => {
  if (!fileList) return;
  const { maxImageBytes, maxTextFileBytes, onError } = options;
  // `input.files` is a live list bound to the input element. Callers reset
  // `input.value` (or unmount the menu that owns the input) synchronously
  // after this handler returns, which empties the list mid-iteration: every
  // `await` below would then end the loop after the first file. Snapshot it
  // before yielding.
  const files = Array.from(fileList);

  for (const file of files) {
    if (isTextFile(file.name)) {
      if (file.size > maxTextFileBytes) {
        onError?.(
          `"${file.name}" is too large (max ${Math.round(maxTextFileBytes / 1024)}KB)`,
        );
        continue;
      }
      const textContent = await readTextFile(file);
      setFiles((prevFiles) => [
        ...prevFiles,
        {
          type: "file",
          mediaType: file.type || "text/plain",
          filename: file.name,
          url: "",
          textContent,
        },
      ]);
      continue;
    }

    if (!file.type.startsWith("image/")) {
      onError?.(`"${file.name}" is not a supported file type`);
      continue;
    }
    if (file.size > maxImageBytes) {
      onError?.(
        `"${file.name}" is too large (max ${Math.round(maxImageBytes / (1024 * 1024))}MB)`,
      );
      continue;
    }
    const filePart = await convertFileToDataURLs(file);
    setFiles((prevFiles) => [...prevFiles, filePart]);
  }
};

export const handleFileUpload = async (
  setFiles: React.Dispatch<React.SetStateAction<FilePart[]>>,
  fileList: FileList | null,
  supportedFiles: ChatModelConfiguration["supportedFiles"]
) => {
  if (fileList) {
    // Same live-list hazard as `handleLocalFileUpload`: snapshot before the
    // first `await`, or closing the attachment menu truncates the selection
    // to a single file.
    const files = Array.from(fileList);
    for (const file of files) {
      // Check if it's a text file (.md, .txt, .xml)
      if (isTextFile(file.name)) {
        // Read text content directly
        const textContent = await readTextFile(file);
        const textFilePart: FilePart = {
          type: "file",
          mediaType: file.type || "text/plain",
          filename: file.name,
          url: "", // No URL needed for text files
          textContent,
        };
        setFiles((prevFiles) => [...prevFiles, textFilePart]);
        continue;
      }

      // Handle images and PDFs (existing logic)
      if (
        (!supportedFiles.includes("img") && file.type.startsWith("image/")) ||
        (!supportedFiles.includes("pdf") && file.type === "application/pdf")
      ) {
        continue;
      }
      const filePart = await convertFileToDataURLs(file);
      setFiles((prevFiles) => [...prevFiles, filePart]);
    }
  }
};
