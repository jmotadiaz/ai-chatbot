"use client";

import { DatabaseBackup } from "lucide-react";
import Link from "@/components/ui/link";
import { Item } from "@/components/ui/item";

export const RAGNav = () => {
  return (
    <div className="mb-6">
      <div className="mb-2 text-sm font-semibold text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
        RAG
      </div>
      <Link href="/rag/upload">
        <Item>
          <DatabaseBackup className="w-4 h-4" />
          Upload Resources
        </Item>
      </Link>
    </div>
  );
};
