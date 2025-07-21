import { cn } from "@/lib/utils";

export interface CheckboxProps {
  children?: React.ReactNode;
  id: string;
  checked: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  className?: string;
}
export const Checkbox: React.FC<CheckboxProps> = ({
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
        "flex items-center text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer select-none",
        className
      )}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 mr-3 text-blue-600 bg-gray-100 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
      />
      {children}
    </label>
  );
};
