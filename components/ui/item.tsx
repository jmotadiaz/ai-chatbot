import { cn } from "@/lib/utils";

export interface ItemProps extends React.ComponentProps<"div"> {
  children?: React.ReactNode;
  loading?: boolean;
}

export const Item: React.FC<ItemProps> = ({
  children,
  loading,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        "gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors select-none",
        { "bg-zinc-800 animate-pulse duration-600": loading },
        className
      )}
      {...props}
    >
      <div
        className={cn("flex items-center", {
          "opacity-0": loading,
        })}
      >
        {children}
      </div>
    </div>
  );
};
