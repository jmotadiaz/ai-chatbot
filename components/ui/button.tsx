import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { SpinnerIcon } from "@/components/icons";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center rounded-md text-sm font-semibold transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 cursor-pointer",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 cursor-pointer",
        outline:
          "border-2 dark:border-zinc-600 bg-transparent shadow-xs active:border-zinc-600 active:dark:border-zinc-300 hover:border-zinc-400 cursor-pointer",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 cursor-pointer",
        ghost:
          "hover:bg-accent hover:dark:bg-zinc-900 hover:text-accent-foreground cursor-pointer",
        link: "text-primary underline-offset-4 hover:underline cursor-pointer",
        icon: "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "p-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  className,
  variant,
  size,
  isLoading = false,
  children,
  disabled,
  ...props
}) => {
  return (
    <button
      data-slot="button"
      disabled={disabled || isLoading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      <span
        className={cn(
          { "opacity-0": isLoading },
          "inline-flex items-center justify-center gap-2 whitespace-nowrap"
        )}
      >
        {children}
      </span>
      {isLoading && (
        <div className="absolute left-1/2 top-1/2 transform -translate-y-1/2 -translate-x-1/2">
          <SpinnerIcon />
        </div>
      )}
    </button>
  );
};

export { Button, buttonVariants };
