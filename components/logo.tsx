"use client";
import { useSidebarContext } from "@/app/providers";
import { LogoIcon } from "./icons";

export const Logo = () => {
  const { toggleSidebar } = useSidebarContext();
  return (
    <div
      className="text-zinc-800 dark:text-zinc-100 -translate-y-[.5px] cursor-pointer"
      onClick={toggleSidebar}
    >
      <LogoIcon />
    </div>
  );
};
