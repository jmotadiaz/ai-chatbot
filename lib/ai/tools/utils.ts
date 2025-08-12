import { RAG_TOOL, Tools, WEB_SEARCH_TOOL } from "@/lib/ai/tools/types";

export const filterTools = (tools: string[]): Tools =>
  tools.filter((tool) => [RAG_TOOL, WEB_SEARCH_TOOL].includes(tool)) as Tools;
