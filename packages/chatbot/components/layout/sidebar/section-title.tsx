import { cn } from "@/lib/utils/helpers";

export const SidebarSectionTitle: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => {
  return (
    <h3
      className={cn(
        "text-sm uppercase flex items-center font-medium text-zinc-500 dark:text-zinc-300 mb-4 tracking-widest",
        className,
      )}
    >
      {children}
    </h3>
  );
};

