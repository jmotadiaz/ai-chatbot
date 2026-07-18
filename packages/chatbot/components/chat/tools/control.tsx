import type { ClassValue } from "clsx";
import { Wrench, Globe, FileSearch } from "lucide-react";
import { ActiveToolsPill } from "./active-tools-pill";
import { ChatControl } from "@/components/chat/control";
import { Toggle } from "@/components/ui/toggle";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { WEB_SEARCH_TOOL } from "@/lib/features/web-search/constants";
import type { Tool, Tools } from "@/lib/features/chat/types";

export interface ToolsControlProps {
  className?: ClassValue;
  tools: Tools;
  toggleTool: (tool: Tool) => void;
  hasTool: (tool: Tool) => boolean;
  enabled: boolean;
  projectId?: string;
}

export const ToolsControl: React.FC<ToolsControlProps> = ({
  className,
  tools,
  toggleTool,
  hasTool,
  enabled,
  projectId,
}) => {
  const { getDropdownPopupProps, getDropdownTriggerProps } = useDropdown();

  if (!enabled) {
    return null;
  }

  const ragToggleId = "rag-tool";
  const webSearchToggleId = "web-search-tool";

  return (
    <div className="flex items-center gap-2">
      <Dropdown.Container data-testid="tools-control-dropdown">
        <ChatControl
          Icon={Wrench}
          type="button"
          className={className}
          aria-label="Configure tools"
          {...getDropdownTriggerProps()}
        />
        <Dropdown.Popup {...getDropdownPopupProps()}>
          {!projectId && (
            <Dropdown.Item
              as={Toggle}
              id={ragToggleId}
              checked={hasTool(RAG_TOOL)}
              onChange={() => toggleTool(RAG_TOOL)}
            >
              <FileSearch
                size={18}
                className="mr-2 text-zinc-600 dark:text-zinc-400"
              />
              <span className="whitespace-nowrap">RAG (Document Search)</span>
            </Dropdown.Item>
          )}

          <Dropdown.Item
            as={Toggle}
            id={webSearchToggleId}
            checked={hasTool(WEB_SEARCH_TOOL)}
            onChange={() => toggleTool(WEB_SEARCH_TOOL)}
          >
            <Globe
              size={18}
              className="mr-2 text-zinc-600 dark:text-zinc-400"
            />
            <span className="whitespace-nowrap">Web Search</span>
          </Dropdown.Item>
        </Dropdown.Popup>
      </Dropdown.Container>
      <ActiveToolsPill
        tools={tools}
        projectId={projectId}
        onDeleteTool={toggleTool}
      />
    </div>
  );
};
