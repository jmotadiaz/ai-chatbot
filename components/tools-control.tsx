import { ClassValue } from "clsx";
import { Wrench, Database, Globe } from "lucide-react";
import { useChatContext } from "@/app/providers";
import { ChatControl } from "@/components/chat-control";
import { Toggle } from "@/components/ui/toggle";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { RAG_TOOL, WEB_SEARCH_TOOL } from "@/lib/ai/tools/types";

export interface ToolsControlProps {
  className?: ClassValue;
}

export const ToolsControl = ({ className }: ToolsControlProps) => {
  const { getDropdownPopupProps, getDropdownTriggerProps } = useDropdown();
  const { tools, toggleTool, hasTool } = useChatContext();

  const isActive = tools.length > 0;

  return (
    <Dropdown.Container>
      <ChatControl
        Icon={Wrench}
        type="button"
        className={className}
        isActive={isActive}
        {...getDropdownTriggerProps()}
      />
      <Dropdown.Popup {...getDropdownPopupProps()} className="space-y-4">
        <Toggle
          id="rag-tool"
          checked={hasTool(RAG_TOOL)}
          onChange={() => toggleTool(RAG_TOOL)}
        >
          <Database className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
          <span className="whitespace-nowrap">RAG (Document Search)</span>
        </Toggle>

        <Toggle
          id="web-search-tool"
          checked={hasTool(WEB_SEARCH_TOOL)}
          onChange={() => toggleTool(WEB_SEARCH_TOOL)}
        >
          <Globe className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
          <span className="whitespace-nowrap">Web Search</span>
        </Toggle>
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
