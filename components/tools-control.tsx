import type { ClassValue } from "clsx";
import { Wrench, Globe, Database } from "lucide-react";
import { useChatContext } from "@/app/(chat)/chat-provider";
import { ChatControl } from "@/components/chat-control";
import { Toggle } from "@/components/ui/toggle";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { RAG_TOOL, WEB_SEARCH_TOOL } from "@/lib/ai/tools/types";
import { getChatConfigurationByModelId } from "@/lib/features/models/config";

export interface ToolsControlProps {
  className?: ClassValue;
}

export const ToolsControl = ({ className }: ToolsControlProps) => {
  const { getDropdownPopupProps, getDropdownTriggerProps } = useDropdown();
  const { tools, toggleTool, hasTool, selectedModel } = useChatContext();

  const modelConfig = getChatConfigurationByModelId(selectedModel);

  const isActive = tools.length > 0;

  if (!modelConfig.toolCalling) {
    return null;
  }

  return (
    <Dropdown.Container data-testid="tools-control-dropdown">
      <ChatControl
        Icon={Wrench}
        type="button"
        className={className}
        isActive={isActive}
        aria-label="Configure tools"
        {...getDropdownTriggerProps()}
      />
      <Dropdown.Popup {...getDropdownPopupProps()}>
        <Dropdown.Item
          as={Toggle}
          id="rag-tool"
          checked={hasTool(RAG_TOOL)}
          onChange={() => toggleTool(RAG_TOOL)}
        >
          <Database className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
          <span className="whitespace-nowrap">RAG (Document Search)</span>
        </Dropdown.Item>

        <Dropdown.Item
          as={Toggle}
          id="web-search-tool"
          checked={hasTool(WEB_SEARCH_TOOL)}
          onChange={() => toggleTool(WEB_SEARCH_TOOL)}
        >
          <Globe className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
          <span className="whitespace-nowrap">Web Search</span>
        </Dropdown.Item>
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
