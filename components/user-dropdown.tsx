"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
export interface UserDropdownProps {
  email: string;
}

export const UserDropdown = ({ email }: UserDropdownProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      <button
        className="w-full flex items-center justify-between p-2 text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-md shadow-md cursor-pointer"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <span className="truncate">{email}</span>
        <ChevronUp
          size={16}
          className={cn(
            "transition-transform duration-300",
            menuOpen ? "rotate-0" : "rotate-180"
          )}
        />
      </button>
      {menuOpen && (
        <div className="absolute bottom-full left-4 right-4 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-md shadow-md whitespace-nowrap">
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600"
            onClick={() => signOut()}
          >
            Sign out
          </button>
        </div>
      )}
    </>
  );
};
