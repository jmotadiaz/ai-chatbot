import type { PutBlobResult } from "@vercel/blob";
import { upload } from "@vercel/blob/client";
import type { FilePart } from "./types";
import type { ModelConfiguration } from "@/lib/features/models/types";

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
  blob: PutBlobResult,
  originalFile: File
): FilePart => {
  return {
    filename: originalFile.name,
    type: "file",
    mediaType: originalFile.type,
    url: blob.url,
  };
};

export const handleFileUpload = async (
  setFiles: React.Dispatch<React.SetStateAction<FilePart[]>>,
  fileList: FileList | null,
  supportedFiles: Required<ModelConfiguration>["supportedFiles"]
) => {
  if (fileList) {
    for (const file of fileList) {
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
      setFiles((prevFiles) => [
        ...prevFiles,
        { ...filePart, loading: { percentage: 0 } },
      ]);
      const blobPromise = upload(file.name, file, {
        access: "public",
        contentType: file.type,
        handleUploadUrl: "/api/upload",
        onUploadProgress: ({ percentage }) => {
          setFiles((prevFiles) =>
            prevFiles.map((f) => {
              if (f.url === filePart.url) {
                return { ...f, loading: { percentage } };
              }
              return f;
            })
          );
        },
      });
      const blob = await blobPromise;
      setFiles((prevFiles) =>
        prevFiles.map((f) => {
          if (f.url === filePart.url) {
            return {
              url: blob.url,
              type: "file",
              filename: file.name,
              mediaType: file.type,
            };
          }
          return f;
        })
      );
    }
  }
};
