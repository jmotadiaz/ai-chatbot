import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  theme?: "outline";
}

const Textarea: React.FC<TextareaProps> = ({ className, theme, ...props }) => {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full rounded-md bg-transparent px-3 py-2 text-base outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-[color,box-shadow]",
        theme === "outline"
          ? ""
          : "border-input focus-visible:border-ring focus-visible:ring-ring/50  border shadow-xs focus-visible:ring-[3px]",
        className
      )}
      {...props}
    />
  );
};

export { Textarea };
