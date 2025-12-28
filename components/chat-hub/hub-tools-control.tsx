"use client";

import React from "react";
import { Wrench, Globe, Database } from "lucide-react";
import type { Tools, Tool } from "@/lib/features/chat/types";
import type { HubInstance } from "@/lib/features/chat/hub/types";
import { ChatControl } from "@/components/chat-control";
import { Toggle } from "@/components/ui/toggle";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { WEB_SEARCH_TOOL } from "@/lib/features/web-search/constants";

export interface HubToolsControlProps {
  tools: Tools;
  toggleTool: (tool: Tool) => void;
  hasTool: (tool: Tool) => boolean;
  instances: HubInstance[];
}

export const HubToolsControl: React.FC<HubToolsControlProps> = ({
  tools,
  toggleTool,
  hasTool,
}) => {
  const { getDropdownPopupProps, getDropdownTriggerProps } = useDropdown();

  const isActive = tools.length > 0;

  return (
    <Dropdown.Container data-testid="hub-tools-control-dropdown">
      <ChatControl
        Icon={Wrench}
        type="button"
        isActive={isActive}
        aria-label="Configure tools"
        {...getDropdownTriggerProps()}
      />
      <Dropdown.Popup {...getDropdownPopupProps()}>
        <Dropdown.Item
          as={Toggle}
          id="hub-rag-tool"
          checked={hasTool(RAG_TOOL)}
          onChange={() => toggleTool(RAG_TOOL)}
        >
          <Database className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
          <span className="whitespace-nowrap">RAG (Document Search)</span>
        </Dropdown.Item>

        <Dropdown.Item
          as={Toggle}
          id="hub-web-search-tool"
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


