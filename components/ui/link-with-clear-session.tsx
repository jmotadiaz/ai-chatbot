"use client";
import NextLink from "next/link";
import React, { ComponentProps } from "react";
import { clearSessionMessages } from "@/lib/ai/session";

type LinkProps = ComponentProps<typeof NextLink>;

const Link: React.FC<LinkProps> = ({ onNavigate, ...props }) => {
  const handleNavigate: LinkProps["onNavigate"] = (...onNavigateArgs) => {
    // Clear session messages or any other session-related data
    clearSessionMessages();
    onNavigate?.(...onNavigateArgs);
  };

  return <NextLink {...props} onNavigate={handleNavigate} />;
};

export default Link;
