import { ClassValue } from "clsx";
import { ComponentType } from "react";
import { cn } from "@/lib/utils";

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
            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
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
