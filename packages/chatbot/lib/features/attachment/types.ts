import type { FileUIPart } from "ai";

export type FilePart = Pick<
  FileUIPart,
  "type" | "mediaType" | "url" | "filename"
> & { loading?: { percentage: number }; textContent?: string };

export interface ImageResponse {
  base64Data: string;
  mediaType: string;
}

export interface ImageFile {
  url: string;
  mediaType: string;
}
