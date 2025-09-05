import {
  unstable_ViewTransition as ViewTransition,
  startTransition,
  useCallback,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface DropdownContainerProps {
  children: React.ReactNode;
  className?: string;
}

const DropdownContainer: React.FC<DropdownContainerProps> = ({
  children,
  className,
}) => {
  return <div className={cn("relative", className)}>{children}</div>;
};

export interface DropdownPopupProps {
  children: React.ReactNode;
  isShown: boolean;
  close: () => void;
  variant?: "top" | "bottom";
  className?: string;
}

const DropdownPopup: React.FC<DropdownPopupProps> = ({
  children,
  className,
  isShown,
  close,
  variant = "top",
}) => {
  return (
    <>
      {isShown && (
        <ViewTransition enter="dropdown-enter" exit="dropdown-exit">
          <div className="fixed inset-0 z-10 bg-transparent" onClick={close} />
          <div
            className={cn(
              "fixed lg:absolute w-full lg:w-auto left-0 bottom-0 bg-secondary-foreground rounded-t-lg lg:rounded-lg shadow-lg z-20 overflow-hidden p-0",
              variant === "top"
                ? "lg:bottom-full lg:mb-2"
                : "top-auto lg:top-full lg:bottom-auto lg:mt-2",
              className
            )}
          >
            {children}
          </div>
        </ViewTransition>
      )}
    </>
  );
};

export type DropdownItemProps<T extends React.ElementType> = {
  children: React.ReactNode;
  className?: string;
  as?: T;
} & React.ComponentPropsWithoutRef<T>;

export function DropdownItem<T extends React.ElementType = "div">({
  children,
  className,
  as,
  ...props
}: DropdownItemProps<T>) {
  const Component = as || "div";
  return (
    <Component
      className={cn(
        "flex items-center space-x-1 px-5 py-3 first:pt-4 last:pb-4 hover:bg-secondary-accent-foreground active:bg-secondary-accent-foreground/70 text-zinc-700 dark:text-zinc-300 cursor-pointer w-full transition-all duration-200",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

const Dropdown = {
  Container: DropdownContainer,
  Popup: DropdownPopup,
  Item: DropdownItem,
};

const useDropdown = () => {
  const [isShown, setIsShown] = useState(false);

  const toggle = () => {
    startTransition(() => {
      setIsShown((prev) => !prev);
    });
  };

  const close = useCallback(() => {
    startTransition(() => {
      setIsShown(false);
    });
  }, []);

  return {
    getDropdownTriggerProps: () => ({ onClick: toggle }),
    getDropdownPopupProps: () => ({ isShown, close }),
    close,
    isShown,
  };
};

export { Dropdown, useDropdown };
