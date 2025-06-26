import { ClassValue } from "clsx";
import { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { SpinnerIcon } from "@/components/icons";

export interface ChatControlProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "className" | "children"
  > {
  Icon: ComponentType<{ className: string }>;
  isLoading?: boolean;
  onLoadingClick?: () => void;
  className?: ClassValue;
}

export const ChatControl = ({
  Icon,
  className,
  isLoading = false,
  disabled,
  onLoadingClick,
  type = "button",
  ...buttonProps
}: ChatControlProps) => {
  return (
    <>
      {isLoading ? (
        <button
          type="button"
          onClick={onLoadingClick}
          disabled={!onLoadingClick}
          {...buttonProps}
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
            className
          )}
          {...buttonProps}
        >
          <Icon className="h-4 w-4 text-white" />
        </button>
      )}
    </>
  );
};
