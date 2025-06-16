"use client";
import NextLink from "next/link";
import React, { ComponentProps } from "react";
import { clearSessionMessages } from "@/lib/ai/session";

type LinkProps = ComponentProps<typeof NextLink>;

const Link: React.FC<LinkProps> = ({ onClick, ...props }) => {
  const handleClick: LinkProps["onClick"] = (...clickArgs) => {
    // Clear session messages or any other session-related data
    clearSessionMessages();
    onClick?.(...clickArgs);
  };

  return <NextLink {...props} onClick={handleClick} />;
};

export default Link;
