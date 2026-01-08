"use client";

import { startTransition, useCallback, useState } from "react";
import type { ClassValue } from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils/helpers";

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

export interface DropdownPopupProps
  extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"
  > {
  children: React.ReactNode;
  isShown: boolean;
  close: () => void;
  variant?:
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | "center";
  className?: string;
}

const variants: Record<Required<DropdownPopupProps>["variant"], ClassValue> = {
  "top-right": "lg:absolute lg:bottom-full lg:mb-2",
  "top-left": "lg:absolute lg:bottom-full lg:right-0 lg:left-auto lg:mb-2",
  "bottom-left":
    "lg:absolute top-auto lg:top-full lg:bottom-auto lg:right-0 lg:left-auto lg:mt-2",
  "bottom-right": "lg:absolute top-auto lg:top-full lg:bottom-auto lg:mt-2",
  center: "lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2",
};

const DropdownPopup: React.FC<DropdownPopupProps> = ({
  children,
  className,
  isShown,
  close,
  variant = "top-right",
  ...props
}) => {
  const initialY =
    variant === "bottom-left" || variant === "bottom-right"
      ? -8
      : variant === "center"
      ? 8
      : 8;

  return (
    <AnimatePresence>
      {isShown && (
        <>
          <motion.div
            key="dropdown-backdrop"
            data-testid="backdrop"
            className="fixed inset-0 z-40 bg-transparent"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
          />
          <motion.div
            key="dropdown-popup"
            className={cn(
              "fixed w-full lg:w-auto left-0 bottom-0 bg-secondary-foreground rounded-t-lg lg:rounded-lg shadow-lg z-50 overflow-hidden pb-4 lg:pb-0",
              variants[variant],
              className
            )}
            initial={{ opacity: 0, y: initialY }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: initialY }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
          >
            <div {...props}>{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
