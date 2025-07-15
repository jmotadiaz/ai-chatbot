"use client";
import { Edit } from "lucide-react";
import Link from "@/components/ui/link";

export const NewChat = () => {
  return (
    <Link
      href="/"
      className="p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
    >
      <Edit size={18} />
    </Link>
  );
};
