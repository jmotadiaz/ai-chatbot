import { createEmbeddings, saveResource, saveChunks } from "../queries";
import { makeIngestUrlResource, makeIngestMarkdownResource } from "./factory";
import { generateEmbeddings } from "./embeddings";
import { fetchAndConvertURL } from "./fetch";
import type {
  RagIngestionDbPort,
  RagIngestionAiPort,
  RagIngestionFetchPort,
} from "./ports";
import { transaction } from "@/lib/infrastructure/db/queries";

export type { UrlResource } from "./fetch";

const dbAdapter: RagIngestionDbPort = {
  transaction: transaction as unknown as RagIngestionDbPort["transaction"], // Cast to unknown as transaction returns Promise<{[K]: ...}>
  saveResource: saveResource as unknown as RagIngestionDbPort["saveResource"],
  saveChunks: saveChunks as unknown as RagIngestionDbPort["saveChunks"],
  createEmbeddings:
    createEmbeddings as unknown as RagIngestionDbPort["createEmbeddings"],
};

const aiAdapter: RagIngestionAiPort = {
  generateEmbeddings,
};

const fetchAdapter: RagIngestionFetchPort = {
  fetchAndConvertURL,
};

export const saveUrlResource = makeIngestUrlResource(
  dbAdapter,
  aiAdapter,
  fetchAdapter,
);

export const saveMarkdownResource = makeIngestMarkdownResource(
  dbAdapter,
  aiAdapter,
);
