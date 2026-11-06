import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn, handleCopy } from "@/lib/utils/helpers";

export interface CopyBlockProps {
  children?: React.ReactNode;
  text: string | null | undefined;
  className?: string;
  iconClassName?: string;
  /**
   * Extra actions rendered in the same top-right cluster as the copy button,
   * before it. A slot (rather than a prop per action) so every surface that
   * adds one keeps a single source of truth for the cluster's position.
   */
  actions?: React.ReactNode;
}

export const CopyBlock: React.FC<CopyBlockProps> = ({
  children,
  text,
  className,
  iconClassName,
  actions,
}) => {
  const [success, setSuccess] = useState(false);
  const handleCopyClick = async () => {
    const successCopy = await handleCopy(text)();
    if (successCopy) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    }
  };
  return (
    <div className={cn("relative", className)}>
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {actions}
        <button
          type="button"
          onClick={handleCopyClick}
          className={cn(
            "cursor-pointer text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300",
            iconClassName
          )}
          aria-label={"Copy code"}
        >
          {success ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
      {children}
    </div>
  );
};
