import { makeIngestUrlResource, makeIngestMarkdownResource } from "./factory";
import { generateEmbeddings } from "./embeddings";

export type { UrlResource } from "./fetch";

const aiAdapter = {
  generateEmbeddings,
} as const;

export const saveUrlResource = makeIngestUrlResource(aiAdapter);

export const saveMarkdownResource = makeIngestMarkdownResource(aiAdapter);
