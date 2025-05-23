"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarContext } from "../app/providers";

interface SidebarProps {
  children?: React.ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
  const { showSidebar, setShowSidebar } = useSidebarContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: session, update } = useSession();
  const [mounted, setMounted] = useState(false);

  const email = session?.user?.email;

  useEffect(() => {
    if (!mounted) {
      setMounted(true);
      update();
    }
  }, [update, mounted]);

  return (
    <>
      <div
        onClick={() => setShowSidebar(false)}
        className={cn(
          "fixed h-screen z-10 top-0 left-0",
          showSidebar ? "w-full" : "w-0"
        )}
      />
      <div className="fixed h-screen z-20 top-0 left-0">
        <div
          className={cn(
            "flex flex-col justify-between h-full pt-24 bg-gray-50 dark:bg-zinc-800 transition-all duration-300 overflow-hidden shadow",
            showSidebar ? "w-72" : "w-0"
          )}
        >
          <div className="flex-1 overflow-auto">{children}</div>
          {email && (
            <div className="relative p-4">
              <button
                className="w-full flex items-center justify-between text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 shadow-md"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <span className="truncate">{email}</span>
                {menuOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {menuOpen && (
                <div className="absolute bottom-full left-4 right-4 bg-white text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded shadow whitespace-nowrap">
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600"
                    onClick={() => signOut()}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
