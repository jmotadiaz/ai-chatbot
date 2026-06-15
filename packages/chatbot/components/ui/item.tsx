import { cn } from "@/lib/utils/helpers";

export interface ItemProps extends React.ComponentProps<"div"> {
  children?: React.ReactNode;
  loading?: boolean;
  active?: boolean;
}

export const Item: React.FC<ItemProps> = ({
  children,
  loading,
  className,
  active,
  ...props
}) => {
  return (
    <div
      className={cn(
        "px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors select-none",
        { "dark:bg-zinc-700 bg-gray-200 animate-pulse duration-600": loading },
        { "dark:bg-zinc-700 bg-gray-200": active },
        className
      )}
      {...props}
    >
      <div
        className={cn("flex items-center gap-3", {
          "opacity-0": loading,
        })}
        role="listitem"
      >
        {children}
      </div>
    </div>
  );
};
