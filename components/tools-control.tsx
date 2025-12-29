"use client";

import { Settings2 } from "lucide-react";
import { Dispatch, SetStateAction } from "react";
import { useMediaQuery } from "usehooks-ts";
import {
  Dropdown,
  useDropdown
} from "@/components/ui/dropdown";
import { Toggle } from "@/components/ui/toggle";

interface ToolsControlProps {
  selectedTools: Set<string>;
  setSelectedTools: Dispatch<SetStateAction<Set<string>>>;
}

export const ToolsControl = ({
  selectedTools,
  setSelectedTools,
}: ToolsControlProps) => {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { getDropdownTriggerProps, getDropdownPopupProps } = useDropdown();

  const handleToolToggle = (toolId: string) => {
    setSelectedTools((prev) => {
      const newTools = new Set(prev);
      if (newTools.has(toolId)) {
        newTools.delete(toolId);
      } else {
        newTools.add(toolId);
      }
      return newTools;
    });
  };

  if (isDesktop) {
    return (
      <div className="flex flex-row gap-2">
        <Toggle
          pressed={selectedTools.has("rag")}
          onPressedChange={() => handleToolToggle("rag")}
          variant="outline"
          aria-label="Toggle RAG"
        >
          RAG
        </Toggle>
        <Toggle
          pressed={selectedTools.has("webSearch")}
          onPressedChange={() => handleToolToggle("webSearch")}
          variant="outline"
          aria-label="Toggle Web Search"
        >
          Web
        </Toggle>
        <Toggle
          pressed={selectedTools.has("imageGenerator")}
          onPressedChange={() => handleToolToggle("imageGenerator")}
          variant="outline"
          aria-label="Toggle Image Gen"
        >
          Image Gen
        </Toggle>
      </div>
    );
  }

  return (
    <Dropdown.Container>
      <div {...getDropdownTriggerProps()}>
        <Settings2
          className={`cursor-pointer w-5 h-5 ${
            selectedTools.size > 0
              ? "text-primary fill-primary"
              : "text-muted-foreground"
          }`}
        />
      </div>
      <Dropdown.Popup {...getDropdownPopupProps()} className="w-56" variant="top-left">
        <div className="p-2 text-sm font-semibold">Tools</div>
        <div className="h-px bg-border my-1" />
        <Dropdown.Item onClick={(e) => e.preventDefault()}>
          <div className="flex items-center justify-between w-full">
            <span>RAG</span>
            <Toggle
              size="sm"
              pressed={selectedTools.has("rag")}
              onPressedChange={() => handleToolToggle("rag")}
              aria-label="Toggle RAG"
            />
          </div>
        </Dropdown.Item>
        <Dropdown.Item onClick={(e) => e.preventDefault()}>
          <div className="flex items-center justify-between w-full">
            <span>Web Search</span>
            <Toggle
              size="sm"
              pressed={selectedTools.has("webSearch")}
              onPressedChange={() => handleToolToggle("webSearch")}
              aria-label="Toggle Web Search"
            />
          </div>
        </Dropdown.Item>
        <Dropdown.Item onClick={(e) => e.preventDefault()}>
          <div className="flex items-center justify-between w-full">
            <span>Image Gen</span>
            <Toggle
              size="sm"
              pressed={selectedTools.has("imageGenerator")}
              onPressedChange={() => handleToolToggle("imageGenerator")}
              aria-label="Toggle Image Gen"
            />
          </div>
        </Dropdown.Item>
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
