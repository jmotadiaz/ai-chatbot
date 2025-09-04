"use client";

import { Database } from "lucide-react";
import Link from "@/components/ui/link";
import { Item } from "@/components/ui/item";
import { SidebarSectionTitle } from "@/components/sidebar";

export const RAGNav = () => {
  return (
    <div className="mb-6">
      <SidebarSectionTitle>RAG</SidebarSectionTitle>
      <Link href="/rag">
        <Item>
          <Database className="w-4 h-4" />
          Resources
        </Item>
      </Link>
    </div>
  );
};
