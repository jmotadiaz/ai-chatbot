import { cn } from "@/lib/utils/helpers";

export interface ToggleProps {
  children?: React.ReactNode;
  id: string;
  checked: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  className?: string;
}
export const Toggle: React.FC<ToggleProps> = ({
  children,
  id,
  checked,
  onChange,
  className,
}) => {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex flex-nowrap items-center text-sm font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer select-none",
        className
      )}
    >
      <div className="relative flex items-center">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={onChange}
          className="sr-only"
        />
        <div className="toggle-bg bg-gray-50 dark:bg-zinc-600 border-2 border-gray-200 dark:border-zinc-600 h-5 w-9 rounded-full mr-3"></div>
      </div>
      {children}
    </label>
  );
};
