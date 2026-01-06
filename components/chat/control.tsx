import type { ClassValue } from "clsx";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { SpinnerIcon } from "@/components/ui/icons";

export interface ChatControlProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "className" | "children"
  > {
  Icon: ComponentType<LucideProps>;
  isLoading?: boolean;
  onLoadingClick?: () => void;
  className?: ClassValue;
  isActive?: boolean;
}

export const ChatControl = ({
  Icon,
  className,
  isLoading = false,
  disabled,
  onLoadingClick,
  isActive,
  type = "button",
  ...buttonProps
}: ChatControlProps) => {
  return (
    <>
      {isLoading ? (
        <button
          type="button"
          {...buttonProps}
          onClick={onLoadingClick}
          className={cn(
            "rounded-full p-2 bg-black disabled:bg-zinc-300 disabled:cursor-not-allowed transition-colors",
            onLoadingClick ? "cursor-pointer" : "cursor-not-allowed",
            className
          )}
        >
          <div className="animate-spin h-4 w-4">
            <SpinnerIcon />
          </div>
        </button>
      ) : (
        <button
          type={type}
          disabled={disabled}
          className={cn(
            "rounded-full p-2 bg-black disabled:bg-zinc-300 disabled:dark:bg-zinc-700 dark:disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer",
            isActive && "bg-blue-600",
            className
          )}
          {...buttonProps}
        >
          <Icon strokeWidth={2} size={16} className="text-white" />
        </button>
      )}
    </>
  );
};
