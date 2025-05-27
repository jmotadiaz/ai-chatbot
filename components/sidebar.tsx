"use client";
import { cn } from "@/lib/utils";
import { useSidebarContext } from "../app/providers";

interface SidebarProps {
  children?: React.ReactNode;
}

export const Sidebar = ({ children }: SidebarProps) => {
  const { showSidebar, setShowSidebar } = useSidebarContext();

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
          {children}
        </div>
      </div>
    </>
  );
};

interface SidebarContentProps {
  children: React.ReactNode;
}

export const SidebarContent = ({ children }: SidebarContentProps) => {
  return <div className="flex-1 w-72 overflow-auto">{children}</div>;
};

export interface SidebarFooterProps {
  children: React.ReactNode;
}

export const SidebarFooter = ({ children }: SidebarFooterProps) => {
  return <div className="relative w-72 p-4">{children}</div>;
};
