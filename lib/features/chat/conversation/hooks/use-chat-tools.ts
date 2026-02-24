"use client";

import { useCallback, useState } from "react";
import type { ChatTools } from "./hook-types";
import type { Tools, Tool } from "@/lib/features/chat/types";

export const useChatTools = (initialTools: Tools = []): ChatTools => {
  const [tools, setTools] = useState<Tools>(initialTools);
  const toggleTool = useCallback((tool: Tool) => {
    setTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  }, []);

  const hasTool = useCallback(
    (tool: Tool) => {
      return tools.includes(tool);
    },
    [tools]
  );

  return { tools, toggleTool, hasTool, setTools };
};


