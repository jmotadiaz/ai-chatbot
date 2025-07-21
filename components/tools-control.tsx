import { useState } from "react";
import { ClassValue } from "clsx";
import { Wrench, Database, Globe } from "lucide-react";
import { useChatContext } from "@/app/providers";
import { ChatControl } from "@/components/chat-control";

export interface ToolsControlProps {
  className?: ClassValue;
}

export const ToolsControl = ({ className }: ToolsControlProps) => {
  const [showTools, setShowTools] = useState(false);
  const { useRAG, useWebSearch, setConfig } = useChatContext();

  const isActive = useRAG || useWebSearch;

  console.log("ToolsControl - useRAG:", useRAG, "useWebSearch:", useWebSearch);

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
          {/* Overlay to close tools on outside click */}
          <div
            className="fixed inset-0 z-10 bg-transparent"
            onClick={() => setShowTools(false)}
          />
          {/* Tools dropdown panel */}
          <div className="absolute left-2 bottom-32 w-64 bg-white dark:bg-zinc-800 p-4 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 z-20">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
              Tools
            </h3>
            <div className="space-y-3">
              {/* RAG Tool */}
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    id="rag-tool"
                    checked={useRAG}
                    onChange={toggleRAG}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600"
                  />
                  <Database className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                  <label
                    htmlFor="rag-tool"
                    className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer select-none"
                  >
                    RAG (Document Search)
                  </label>
                </div>
              </div>

              {/* Web Search Tool */}
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    id="web-search-tool"
                    checked={useWebSearch}
                    onChange={toggleWebSearch}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600"
                  />
                  <Globe className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                  <label
                    htmlFor="web-search-tool"
                    className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer select-none"
                  >
                    Web Search
                  </label>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
