"use client";
import { LogoIcon } from "@/components/icons";
import { useSidebarContext } from "@/app/providers";

export const Logo = () => {
  const { toggleNavSidebar } = useSidebarContext();
  return (
    <div
      className="text-zinc-800 dark:text-zinc-100 -translate-y-[.5px] cursor-pointer"
      onClick={toggleNavSidebar}
    >
      <LogoIcon />
    </div>
  );
};
