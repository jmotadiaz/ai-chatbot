import { useState } from "react";
import { ClassValue } from "clsx";
import { Wrench, Database, Globe } from "lucide-react";
import { useChatContext } from "@/app/providers";
import { ChatControl } from "@/components/chat-control";
import { Toggle } from "@/components/ui/toggle";

export interface ToolsControlProps {
  className?: ClassValue;
}

export const ToolsControl = ({ className }: ToolsControlProps) => {
  const [showTools, setShowTools] = useState(false);
  const { useRAG, useWebSearch, setConfig } = useChatContext();

  const isActive = useRAG || useWebSearch;

  const toggleRAG = () => {
    setConfig({ useRAG: !useRAG });
  };

  const toggleWebSearch = () => {
    setConfig({ useWebSearch: !useWebSearch });
  };

  return (
    <>
      <ChatControl
        Icon={Wrench}
        type="button"
        onClick={() => setShowTools(!showTools)}
        className={className}
        isActive={isActive}
      />
      {showTools && (
        <>
          <div
            className="fixed inset-0 z-10 bg-transparent"
            onClick={() => setShowTools(false)}
          />
          <div className="absolute space-y-2 left-2 bottom-32 w-72 bg-white dark:bg-zinc-800 p-4 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 z-20">
            <Toggle id="rag-tool" checked={useRAG} onChange={toggleRAG}>
              <Database className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
              <span>RAG (Document Search)</span>
            </Toggle>

            <Toggle
              id="web-search-tool"
              checked={useWebSearch}
              onChange={toggleWebSearch}
            >
              <Globe className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
              <span>Web Search</span>
            </Toggle>
          </div>
        </>
      )}
    </>
  );
};
