"use client";
import { Edit } from "lucide-react";
import Link from "@/components/ui/link";

export const NewChat = () => {
  return (
    <Link
      href="/"
      className=" text-zinc-700 dark:text-zinc-200 border-none cursor-pointer"
    >
      <Edit size={18} />
    </Link>
  );
};
