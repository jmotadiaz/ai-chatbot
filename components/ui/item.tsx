import { cn } from "@/lib/utils";

export interface ItemProps extends React.ComponentProps<"div"> {
  children?: React.ReactNode;
}

export const Item: React.FC<ItemProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors select-none",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
