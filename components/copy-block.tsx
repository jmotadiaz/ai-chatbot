import { Copy } from "lucide-react";
import { cn, handleCopy } from "@/lib/utils";

export interface CopyBlockProps {
  children?: React.ReactNode;
  text: string | null | undefined;
  className?: string;
}
export const CopyBlock: React.FC<CopyBlockProps> = ({
  children,
  text,
  className,
}) => {
  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={handleCopy(text)}
        className="absolute top-2 right-2 cursor-pointer text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        aria-label={"Copy code"}
      >
        <Copy size={16} />
      </button>
      {children}
    </div>
  );
};
