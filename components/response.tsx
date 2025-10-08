"use client";

import { memo } from "react";
import type { StreamdownProps } from "streamdown";
import { Streamdown } from "streamdown";
import addClasses from "rehype-class-names";
import { cn } from "@/lib/utils";

const components: StreamdownProps["components"] = {
  table: ({ children, ...props }) => {
    return (
      <div className="mt-6 mb-8 w-full overflow-x-auto">
        <table className="table-auto w-auto text-sm" {...props}>
          {children}
        </table>
      </div>
    );
  },
  th: ({ children, ...props }) => {
    return (
      <th
        className="whitespace-nowrap text-left py-2 px-3 first-of-type:pl-0 last-of-type:pr-0 border-b border-secondary break-word"
        {...props}
      >
        {children}
      </th>
    );
  },
  td: ({ children, ...props }) => {
    return (
      <td
        className="py-2 px-3 first-of-type:pl-0 last-of-type:pr-0 border-b border-secondary wrap-break-word"
        {...props}
      >
        {children}
      </td>
    );
  },
};

export const Response = memo(
  ({ className, ...props }: StreamdownProps) => (
    <Streamdown
      className={cn(
        "size-full animate-streaming [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      components={components}
      rehypePlugins={[
        [addClasses, { "h1,h2,h3,h4,h5,h6,p,li,code,pre": "animate-fade" }],
      ]}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
