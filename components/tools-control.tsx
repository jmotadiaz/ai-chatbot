import { ClassValue } from "clsx";
import { Wrench, Database, Globe } from "lucide-react";
import { useChatContext } from "@/app/providers";
import { ChatControl } from "@/components/chat-control";
import { Toggle } from "@/components/ui/toggle";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";

export interface ToolsControlProps {
  className?: ClassValue;
}

export const ToolsControl = ({ className }: ToolsControlProps) => {
  const { getDropdownPopupProps, getDropdownTriggerProps } = useDropdown();
  const { useRAG, useWebSearch, setConfig } = useChatContext();

  const isActive = useRAG || useWebSearch;

  const toggleRAG = () => {
    setConfig({ useRAG: !useRAG });
  };

  const toggleWebSearch = () => {
    setConfig({ useWebSearch: !useWebSearch });
  };

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
        <Toggle id="rag-tool" checked={useRAG} onChange={toggleRAG}>
          <Database className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
          <span className="whitespace-nowrap">RAG (Document Search)</span>
        </Toggle>

        <Toggle
          id="web-search-tool"
          checked={useWebSearch}
          onChange={toggleWebSearch}
        >
          <Globe className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
          <span className="whitespace-nowrap">Web Search</span>
        </Toggle>
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
