"use client";
import NextLink from "next/link";
import React, { ComponentProps } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSidebarContext } from "@/app/providers";

type LinkProps = ComponentProps<typeof NextLink>;

const ChatLink: React.FC<LinkProps> = ({ onNavigate, className, ...props }) => {
  const pathname = usePathname();
  const { setShowSidebar } = useSidebarContext();
  const handleNavigate: LinkProps["onNavigate"] = (e) => {
    if (pathname === props.href) {
      e.preventDefault();
      setShowSidebar(false);
    } else {
      onNavigate?.(e);
    }
  };

  return (
    <NextLink
      className={cn("cursor-pointer", className)}
      {...props}
      onNavigate={handleNavigate}
    />
  );
};

export default ChatLink;
