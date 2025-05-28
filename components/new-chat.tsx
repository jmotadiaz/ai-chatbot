"use client";
import { Edit } from "lucide-react";
import { Button } from "./ui/button";
import Link from "next/link";
import { clearSessionMessages } from "../lib/ai/session";

export const NewChat = () => {
  return (
    <Link
      href="/"
      onClick={() => {
        clearSessionMessages();
      }}
    >
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-3 text-zinc-700 dark:text-zinc-200 border-none cursor-pointer"
      >
        <Edit />
      </Button>
    </Link>
  );
};
