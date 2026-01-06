import { cn } from "@/lib/utils/helpers";

export interface ContentProps {
  children: React.ReactNode;
  className?: string;
}
export const Content: React.FC<ContentProps> = ({ children, className }) => {
  return (
    <div
      className={cn("w-full h-full overflow-y-auto pt-18 xl:pt-24", className)}
    >
      <div className="max-w-[1024px] mx-auto px-4">{children}</div>
    </div>
  );
};
