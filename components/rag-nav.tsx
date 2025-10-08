"use client";

import { Database } from "lucide-react";
import type { ClassValue } from "clsx";
import ChatLink from "@/components/chat-link";
import { Item } from "@/components/ui/item";
import { cn } from "@/lib/utils";

export interface RAGNavProps {
  className?: ClassValue;
}

export const RAGNav: React.FC<RAGNavProps> = ({ className }) => {
  return (
    <div className={cn(className)}>
      <ChatLink href="/rag">
        <Item>
          <Database className="w-4 h-4" />
          Resources
        </Item>
      </ChatLink>
    </div>
  );
};
