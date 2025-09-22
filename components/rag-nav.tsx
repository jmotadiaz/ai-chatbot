"use client";

import { Database } from "lucide-react";
import ChatLink from "@/components/chat-link";
import { Item } from "@/components/ui/item";
import { SidebarSectionTitle } from "@/components/sidebar";

export const RAGNav = () => {
  return (
    <div className="mb-6">
      <SidebarSectionTitle>RAG</SidebarSectionTitle>
      <ChatLink href="/rag">
        <Item>
          <Database className="w-4 h-4" />
          Resources
        </Item>
      </ChatLink>
    </div>
  );
};
