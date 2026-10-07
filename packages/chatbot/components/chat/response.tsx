"use client";

import { memo } from "react";
import type { StreamdownProps } from "streamdown";
import { Streamdown } from "streamdown";
import addClasses from "rehype-class-names";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import { cn } from "@/lib/utils/helpers";

export const Response = memo(
  ({ className, ...props }: StreamdownProps) => (
    <Streamdown
      className={cn(
        "size-full animate-streaming [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      plugins={{ code, mermaid, math, cjk }}
      rehypePlugins={[
        [
          addClasses,
          {
            "h1,h2,h3,h4,h5,h6,p,li,span.line": "animate-fade",
            // Cell wrapping is governed by the `[data-streamdown="table"]`
            // rule in globals.css: words stay whole so content-heavy cells
            // widen their column instead of splitting words into narrow ones.
          },
        ],
      ]}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

Response.displayName = "Response";
