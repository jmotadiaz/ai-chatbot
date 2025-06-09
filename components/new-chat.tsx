"use client";
import { Edit } from "lucide-react";
import Link from "next/link";
import { clearSessionMessages } from "../lib/ai/session";

export const NewChat = () => {
  return (
    <Link
      href="/"
      className=" text-zinc-700 dark:text-zinc-200 border-none cursor-pointer"
      onClick={() => {
        clearSessionMessages();
      }}
    >
      <Edit size={18} />
    </Link>
  );
};
