import { Copy } from "lucide-react";
import { cn, handleCopy } from "@/lib/utils";

export interface CopyBlockProps {
  children?: React.ReactNode;
  text: string | null | undefined;
  className?: string;
  iconClassName?: string;
}
export const CopyBlock: React.FC<CopyBlockProps> = ({
  children,
  text,
  className,
  iconClassName,
}) => {
  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={handleCopy(text)}
        className={cn(
          "absolute top-2 right-2 cursor-pointer text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300",
          iconClassName
        )}
        aria-label={"Copy code"}
      >
        <Copy size={16} />
      </button>
      {children}
    </div>
  );
};
