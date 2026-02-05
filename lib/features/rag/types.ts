import { SimilarChunk } from "./queries";

export type RagChunk = Pick<
  SimilarChunk,
  "id" | "content" | "resourceTitle" | "resourceUrl"
>;

export interface Resource {
  title: string;
  url?: string;
  content: string;
}

export interface UIResource {
  id: string;
  title: string;
  url: string | null;
}

export const QUERY_TYPES = ["RETRIEVAL_QUERY", "CODE_RETRIEVAL_QUERY"] as const;
export type QueryType = (typeof QUERY_TYPES)[number];
