import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn, handleCopy } from "@/lib/utils/helpers";

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
      <button
        type="button"
        onClick={handleCopyClick}
        className={cn(
          "absolute top-2 right-2 cursor-pointer text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300",
          iconClassName
        )}
        aria-label={"Copy code"}
      >
        {success ? <Check size={16} /> : <Copy size={16} />}
      </button>
      {children}
    </div>
  );
};
