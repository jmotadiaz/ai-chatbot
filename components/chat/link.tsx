"use client";
import NextLink from "next/link";
import type { ComponentProps } from "react";
import React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/helpers";
import { useSidebarContext } from "@/app/providers";

type LinkProps = ComponentProps<typeof NextLink>;

const ChatLink: React.FC<LinkProps> = ({ onNavigate, className, ...props }) => {
  const { setShowSidebar } = useSidebarContext();
  const pathname = usePathname();
  const toPath =
    typeof props.href === "string" ? props.href : props.href?.pathname;
  const handleNavigate: LinkProps["onNavigate"] = (e) => {
    if (toPath === pathname) {
      setShowSidebar(false);
    }
    onNavigate?.(e);
  };

  return (
    <NextLink
      {...props}
      className={cn("cursor-pointer", className)}
      onNavigate={handleNavigate}
    />
  );
};

export default ChatLink;
