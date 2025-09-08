"use client";

import { memo } from "react";
import { Streamdown, StreamdownProps } from "streamdown";
import CodeBlock from "@/components/code-block";
import { cn } from "@/lib/utils";

const components: StreamdownProps["components"] = {
  code: CodeBlock,
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
        className="whitespace-nowrap text-left py-2 pr-3 border-b border-secondary break-word"
        {...props}
      >
        {children}
      </th>
    );
  },
  td: ({ children, ...props }) => {
    return (
      <td
        className="py-2 pr-3 border-b border-secondary wrap-break-word"
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
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      components={components}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
