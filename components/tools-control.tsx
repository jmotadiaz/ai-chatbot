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
          id="rag"
          checked={selectedTools.has("rag")}
          onChange={() => handleToolToggle("rag")}
        >
          RAG
        </Toggle>
        <Toggle
          id="webSearch"
          checked={selectedTools.has("webSearch")}
          onChange={() => handleToolToggle("webSearch")}
        >
          Web
        </Toggle>
        <Toggle
          id="imageGenerator"
          checked={selectedTools.has("imageGenerator")}
          onChange={() => handleToolToggle("imageGenerator")}
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
              id="rag-mobile"
              checked={selectedTools.has("rag")}
              onChange={() => handleToolToggle("rag")}
            />
          </div>
        </Dropdown.Item>
        <Dropdown.Item onClick={(e) => e.preventDefault()}>
          <div className="flex items-center justify-between w-full">
            <span>Web Search</span>
            <Toggle
              id="webSearch-mobile"
              checked={selectedTools.has("webSearch")}
              onChange={() => handleToolToggle("webSearch")}
            />
          </div>
        </Dropdown.Item>
        <Dropdown.Item onClick={(e) => e.preventDefault()}>
          <div className="flex items-center justify-between w-full">
            <span>Image Gen</span>
            <Toggle
              id="imageGenerator-mobile"
              checked={selectedTools.has("imageGenerator")}
              onChange={() => handleToolToggle("imageGenerator")}
            />
          </div>
        </Dropdown.Item>
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
