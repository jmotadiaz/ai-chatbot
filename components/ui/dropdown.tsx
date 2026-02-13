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

export interface DropdownPopupProps extends Omit<
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
    | "center"
    | "responsive-top-left"
    | "responsive-top-right"
    | "responsive-bottom-left"
    | "responsive-bottom-right"
    | "responsive-center";
  className?: string;
}

const variants: Record<Required<DropdownPopupProps>["variant"], ClassValue> = {
  // Static variants
  "top-right": "absolute w-auto rounded-lg pb-0 bottom-full left-0 mb-2",
  "top-left": "absolute w-auto rounded-lg pb-0 bottom-full right-0 mb-2",
  "bottom-right": "absolute w-auto rounded-lg pb-0 top-full right-0 mt-2",
  "bottom-left": "absolute w-auto rounded-lg pb-0 top-full left-0 mt-2",
  center:
    "fixed w-auto rounded-lg pb-0 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",

  // Responsive variants
  "responsive-top-right":
    "fixed w-full lg:w-auto left-0 bottom-0 rounded-t-lg lg:rounded-lg pb-4 lg:pb-0 lg:absolute lg:bottom-full lg:mb-2",
  "responsive-top-left":
    "fixed w-full lg:w-auto left-0 bottom-0 rounded-t-lg lg:rounded-lg pb-4 lg:pb-0 lg:absolute lg:bottom-full lg:right-0 lg:left-auto lg:mb-2",
  "responsive-bottom-left":
    "fixed w-full lg:w-auto left-0 bottom-0 rounded-t-lg lg:rounded-lg pb-4 lg:absolute top-auto lg:top-full lg:bottom-auto lg:right-0 lg:left-auto lg:mt-2",
  "responsive-bottom-right":
    "fixed w-full lg:w-auto left-0 bottom-0 rounded-t-lg lg:rounded-lg pb-4 lg:pb-0 lg:absolute top-auto lg:top-full lg:bottom-auto lg:mt-2",
  "responsive-center":
    "fixed w-full lg:w-auto left-0 bottom-0 rounded-t-lg lg:rounded-lg pb-4 lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2",
};

const DropdownPopup: React.FC<DropdownPopupProps> = ({
  children,
  className,
  isShown,
  close,
  variant = "top-right",
  ...props
}) => {
  const baseVariant = variant.replace("responsive-", "");

  const initialY =
    baseVariant === "bottom-left" || baseVariant === "bottom-right"
      ? -8
      : baseVariant === "center"
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
              "bg-secondary-foreground shadow-lg z-50 overflow-hidden",
              variants[variant],
              className,
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
        "flex items-center gap-2 px-5 py-3 first:pt-4 last:pb-4 hover:bg-secondary-accent-foreground active:bg-secondary-accent-foreground/70 text-zinc-700 dark:text-zinc-300 cursor-pointer w-full transition-all duration-200",
        className,
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
