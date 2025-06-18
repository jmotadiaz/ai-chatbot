"use client";
import NextLink from "next/link";
import React, { ComponentProps } from "react";
import { usePathname } from "next/navigation";
import { clearSessionMessages } from "@/lib/ai/session";

type LinkProps = ComponentProps<typeof NextLink>;

const Link: React.FC<LinkProps> = ({ onNavigate, ...props }) => {
  const pathname = usePathname();
  const handleNavigate: LinkProps["onNavigate"] = (e) => {
    if (pathname === props.href) {
      e.preventDefault();
    } else {
      clearSessionMessages();
    }
    onNavigate?.(e);
  };

  return <NextLink {...props} onNavigate={handleNavigate} />;
};

export default Link;
