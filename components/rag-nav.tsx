"use client";

import { Database } from "lucide-react";
import Link from "@/components/ui/link";

export const RAGNav = () => {
  return (
    <div className="mb-6">
      <div className="mb-2 px-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        RAG
      </div>
      <Link
        href="/rag/upload"
        className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
      >
        <Database className="w-4 h-4" />
        Upload Resources
      </Link>
    </div>
  );
};