"use client";
import { signOut } from "next-auth/react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
export interface UserDropdownProps {
  email: string;
}

export const UserDropdown = ({ email }: UserDropdownProps) => {
  const { getDropdownPopupProps, getDropdownTriggerProps, isShown } =
    useDropdown();
  return (
    <Dropdown.Container>
      <button
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 border-2 border-gray-300 hover:bg-gray-200 dark:border-zinc-700 dark:hover:bg-zinc-600 rounded-lg transition-colors select-none cursor-pointer"
        {...getDropdownTriggerProps()}
      >
        <span className="truncate">{email}</span>
        <ChevronUp
          size={16}
          className={cn(
            "transition-transform duration-300",
            isShown ? "rotate-0" : "rotate-180"
          )}
        />
      </button>
      <Dropdown.Popup
        {...getDropdownPopupProps()}
        variant="top"
        className="w-full p-0 border-2 border-gray-300 dark:border-zinc-700"
      >
        <button
          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-200 dark:hover:bg-zinc-600 cursor-pointer"
          onClick={() => signOut()}
        >
          Sign out
        </button>
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
