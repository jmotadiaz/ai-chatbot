import { createEmbeddings, saveResource, saveChunks } from "../queries";
import { makeIngestUrlResource, makeIngestMarkdownResource } from "./factory";
import { generateEmbeddings } from "./embeddings";
import { transaction } from "@/lib/infrastructure/db/queries";

export type { UrlResource } from "./fetch";

const dbAdapter = {
  transaction,
  saveResource,
  saveChunks,
  createEmbeddings,
} as const;

const aiAdapter = {
  generateEmbeddings,
} as const;

export const saveUrlResource = makeIngestUrlResource(dbAdapter, aiAdapter);

export const saveMarkdownResource = makeIngestMarkdownResource(
  dbAdapter,
  aiAdapter,
);
