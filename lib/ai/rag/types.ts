import { SimilarChunk } from "@/lib/db/queries";

export type RagChunk = Pick<
  SimilarChunk,
  "id" | "content" | "resourceTitle" | "resourceUrl"
>;
