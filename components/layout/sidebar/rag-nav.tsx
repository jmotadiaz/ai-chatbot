"use client";

import { FileSearch } from "lucide-react";
import type { ClassValue } from "clsx";
import ChatLink from "@/components/chat/link";
import { Item } from "@/components/ui/item";
import { cn } from "@/lib/utils/helpers";

export interface RAGNavProps {
  className?: ClassValue;
}

export const RAGNav: React.FC<RAGNavProps> = ({ className }) => {
  return (
    <div className={cn(className)}>
      <ChatLink href="/rag">
        <Item>
          <FileSearch size={18} />
          Resources
        </Item>
      </ChatLink>
    </div>
  );
};
