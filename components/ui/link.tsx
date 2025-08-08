"use client";
import NextLink from "next/link";
import React, { ComponentProps } from "react";
import { usePathname } from "next/navigation";
import { clearChatDataInSession } from "@/lib/ai/client-session";
import { cn } from "@/lib/utils";

type LinkProps = ComponentProps<typeof NextLink>;

const Link: React.FC<LinkProps> = ({ onNavigate, className, ...props }) => {
  const pathname = usePathname();
  const handleNavigate: LinkProps["onNavigate"] = (e) => {
    if (pathname === props.href) {
      e.preventDefault();
    } else {
      clearChatDataInSession();
    }
    onNavigate?.(e);
  };

  return (
    <NextLink
      className={cn("cursor-pointer", className)}
      {...props}
      onNavigate={handleNavigate}
    />
  );
};

export default Link;
