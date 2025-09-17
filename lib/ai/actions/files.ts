"use server";
import { put, del, PutBlobResult } from "@vercel/blob";
import { FilePart } from "@/lib/ai/utils";

export const uploadFiles = async (files: FileList): Promise<FilePart[]> => {
  try {
    const blobPromises: Promise<PutBlobResult>[] = [];
    for (const file of files) {
      blobPromises.push(
        put(file.name, file, {
          access: "public",
          addRandomSuffix: true,
          contentType: file.type,
        })
      );
    }
    const blobs = await Promise.all(blobPromises);
    return blobs.map((blob, index) => toFilePart(blob, files[index]));
  } catch (error) {
    console.error("Error uploading files:", error);
    return [];
  }
};

export const deleteFile = async (fileUrl: string): Promise<void> => {
  const url = new URL(fileUrl);
  await del(url.pathname);
};

const toFilePart = (blob: PutBlobResult, originalFile: File): FilePart => {
  return {
    filename: originalFile.name,
    type: "file",
    mediaType: originalFile.type,
    url: blob.url,
  };
};
