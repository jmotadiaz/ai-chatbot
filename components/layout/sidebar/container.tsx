"use client";
import { useSidebarContext } from "@/app/providers";
import { cn } from "@/lib/utils/helpers";

interface SidebarContainerProps {
  children?: React.ReactNode;
}

export const SidebarContainer = ({ children }: SidebarContainerProps) => {
  const { showSidebar, setShowSidebar } = useSidebarContext();

  return (
    <div>
      <div
        onClick={() => setShowSidebar(false)}
        className={cn(
          "fixed h-screen z-10 top-0 left-0",
          showSidebar ? "w-full" : "w-0"
        )}
      />
      <div className="fixed h-screen z-20 top-0 left-0">
        <div
          data-testid="sidebar-container"
          className={cn(
            "flex flex-col justify-between h-full pt-24 bg-secondary transition-all duration-300 overflow-hidden shadow-lg",
            showSidebar ? "w-80" : "w-0"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

