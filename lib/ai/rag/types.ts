import { SimilarChunk } from "@/lib/db/queries";

export type RagChunk = Pick<
  SimilarChunk,
  "content" | "resourceTitle" | "resourceUrl"
>;
