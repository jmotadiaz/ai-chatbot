export const RAG_TOOL = "rag";
export const WEB_SEARCH_TOOL = "webSearch";
export const URL_CONTEXT_TOOL = "urlContext";

export type Tool =
  | typeof RAG_TOOL
  | typeof WEB_SEARCH_TOOL
  | typeof URL_CONTEXT_TOOL;

export type Tools = Array<Tool>;

export const TOOLS: Tools = [RAG_TOOL, WEB_SEARCH_TOOL, URL_CONTEXT_TOOL];
