import { cn } from "@/lib/utils/helpers";

export interface MainProps {
  children: React.ReactNode;
  className?: string;
}
export const Main: React.FC<MainProps> = ({ children, className }) => {
  return (
    <main
      className={cn(
        "h-svh flex flex-col justify-center w-full stretch",
        className
      )}
    >
      {children}
    </main>
  );
};
