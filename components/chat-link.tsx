"use client";
import NextLink from "next/link";
import React, { ComponentProps, useEffect } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSidebarContext } from "@/app/providers";

type LinkProps = ComponentProps<typeof NextLink>;

const ChatLink: React.FC<LinkProps> = ({ onNavigate, className, ...props }) => {
  const pathname = usePathname();
  const { setShowSidebar } = useSidebarContext();
  const handleNavigate: LinkProps["onNavigate"] = (e) => {
    if (pathname === props.href) {
      console.log("Same path, not navigating");
      e.preventDefault();
      setShowSidebar(false);
    } else {
      onNavigate?.(e);
    }
  };

  useEffect(() => {
    console.log("changed effect for pathname in ChatLink");
    setShowSidebar(false);
  }, [pathname, setShowSidebar]);

  return (
    <NextLink
      className={cn("cursor-pointer", className)}
      {...props}
      onNavigate={handleNavigate}
    />
  );
};

export default ChatLink;
