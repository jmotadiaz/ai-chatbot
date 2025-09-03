import { ClassValue } from "clsx";
import { Wrench, Database, Globe } from "lucide-react";
import { useChatContext } from "@/app/providers";
import { ChatControl } from "@/components/chat-control";
import { Toggle } from "@/components/ui/toggle";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { RAG_TOOL, WEB_SEARCH_TOOL } from "@/lib/ai/tools/types";
import { getChatConfigurationByModelId } from "@/lib/ai/models/utils";

export interface ToolsControlProps {
  className?: ClassValue;
}

export const ToolsControl = ({ className }: ToolsControlProps) => {
  const { getDropdownPopupProps, getDropdownTriggerProps } = useDropdown();
  const { tools, toggleTool, hasTool, selectedModel } = useChatContext();

  const modelConfig = getChatConfigurationByModelId(selectedModel);

  const isActive = tools.length > 0;

  if (
    modelConfig.disabledTools.includes(RAG_TOOL) &&
    modelConfig.disabledTools.includes(WEB_SEARCH_TOOL)
  ) {
    return null;
  }

  return (
    <Dropdown.Container>
      <ChatControl
        Icon={Wrench}
        type="button"
        className={className}
        isActive={isActive}
        {...getDropdownTriggerProps()}
      />
      <Dropdown.Popup {...getDropdownPopupProps()}>
        {!modelConfig.disabledTools.includes(RAG_TOOL) && (
          <Dropdown.Item
            as={Toggle}
            id="rag-tool"
            checked={hasTool(RAG_TOOL)}
            onChange={() => toggleTool(RAG_TOOL)}
          >
            <Database className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
            <span className="whitespace-nowrap">RAG (Document Search)</span>
          </Dropdown.Item>
        )}

        {!modelConfig.disabledTools.includes(WEB_SEARCH_TOOL) && (
          <Dropdown.Item
            as={Toggle}
            id="web-search-tool"
            checked={hasTool(WEB_SEARCH_TOOL)}
            onChange={() => toggleTool(WEB_SEARCH_TOOL)}
          >
            <Globe className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
            <span className="whitespace-nowrap">Web Search</span>
          </Dropdown.Item>
        )}
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
