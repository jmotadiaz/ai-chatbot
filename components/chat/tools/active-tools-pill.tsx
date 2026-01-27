import { Database, Globe, Link, X } from "lucide-react";
import { type Tool } from "@/lib/features/chat/types";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import {
  WEB_SEARCH_TOOL,
  URL_CONTEXT_TOOL,
} from "@/lib/features/web-search/constants";

export interface ActiveToolsPillProps {
  tools: Tool[];
  onDeleteTool: (tool: Tool) => void;
  projectId?: string;
}

export const ActiveToolsPill = ({
  tools,
  onDeleteTool,
  projectId,
}: ActiveToolsPillProps) => {
  const visibleTools = tools.filter((tool) => {
    if (projectId && tool === RAG_TOOL) return false;
    return true;
  });

  if (visibleTools.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {visibleTools.map((tool) => {
        const config = getToolConfig(tool);
        if (!config) return null;
        const Icon = config.icon;

        return (
          <div
            key={tool}
            className="flex items-center font-medium gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full border-2 border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-400 font-medium select-none"
            data-testid={`active-tool-pill-${tool}`}
          >
            <Icon size={12} />
            <span>{config.label}</span>
            <span className="cursor-pointer" onClick={() => onDeleteTool(tool)}>
              <X className="w-3 h-3" />
            </span>
          </div>
        );
      })}
    </div>
  );
};

const getToolConfig = (tool: Tool) => {
  switch (tool) {
    case RAG_TOOL:
      return { icon: Database, label: "RAG" };
    case WEB_SEARCH_TOOL:
      return { icon: Globe, label: "Web Search" };
    case URL_CONTEXT_TOOL:
      return { icon: Link, label: "Context" };
    default:
      return null;
  }
};
