import { SimilarChunk } from "@/lib/db/queries";

export type RagChunk = Pick<
  SimilarChunk,
  "chunkId" | "content" | "resourceTitle" | "resourceUrl"
>;
