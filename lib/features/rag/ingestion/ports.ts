import type { UrlResource } from "./fetch";
import type {
  InsertChunk,
  InsertEmbedding,
} from "@/lib/infrastructure/db/schema";
import type { Resource } from "@/lib/features/rag/types";

// The port relies on the actual PG transaction from infrastructure to
// keep it simple, or we can just abstract it as `any` if we want to be strict,
// but since the Drizzle transaction is heavily typed, we'll use a type parameter or any.
export interface RagIngestionDbPort<Tx = unknown> {
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<[T]>;
  saveResource(data: {
    title: string;
    url?: string | null;
    userId?: string | null;
    projectId?: string;
  }): (tx: Tx) => Promise<{ id: string }>;
  saveChunks(data: InsertChunk[]): (tx: Tx) => Promise<unknown>;
  createEmbeddings(data: InsertEmbedding[]): (tx: Tx) => Promise<unknown>;
}

export interface RagIngestionAiPort {
  generateEmbeddings(
    inputs: { chunkId: string; content: string }[],
  ): Promise<{ chunkId: string; embedding: number[] }[]>;
}

export interface RagIngestionFetchPort {
  fetchAndConvertURL(urlResource: UrlResource): Promise<Resource | null>;
}
