"use client";

import { memo } from "react";
import type { StreamdownProps } from "streamdown";
import { Streamdown } from "streamdown";
import addClasses from "rehype-class-names";
import { cn } from "@/lib/utils";

export const Response = memo(
  ({ className, ...props }: StreamdownProps) => (
    <Streamdown
      className={cn(
        "size-full animate-streaming [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      rehypePlugins={[
        [addClasses, { "h1,h2,h3,h4,h5,h6,p,li,code,pre": "animate-fade" }],
      ]}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
