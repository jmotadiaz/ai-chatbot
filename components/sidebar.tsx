"use client";
import { useSidebarContext } from "@/app/providers";
import { cn } from "@/lib/utils";

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
          data-testid="sidebar"
          className={cn(
            "flex flex-col justify-between h-full pt-24 bg-secondary transition-all duration-300 overflow-hidden shadow-lg",
            showSidebar ? "w-80" : "w-0"
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
  return (
    <div className="flex-1 px-4 w-80 overflow-auto scrollbar-none">
      {children}
    </div>
  );
};

export interface SidebarFooterProps {
  children: React.ReactNode;
}

export const SidebarFooter = ({ children }: SidebarFooterProps) => {
  return <div className="relative px-4 w-80 p-4">{children}</div>;
};

export const SidebarSectionTitle: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <h3 className="text-sm uppercase flex items-center font-medium text-zinc-500 dark:text-zinc-300 mb-4 tracking-widest">
      {children}
    </h3>
  );
};
