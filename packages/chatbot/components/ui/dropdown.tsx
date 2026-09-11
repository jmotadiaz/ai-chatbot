"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
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
  /**
   * Prueba B: eleva el bottom-sheet sobre el teclado virtual vía
   * `visualViewport`. Solo afecta a las variantes `fixed bottom-0` en
   * mobile (<lg); en desktop el inset es 0 y no hace nada.
   */
  avoidKeyboard?: boolean;
}

const variants: Record<Required<DropdownPopupProps>["variant"], ClassValue> = {
  // Static variants
  "top-right": "absolute w-auto rounded-lg bottom-full left-0 mb-2",
  "top-left": "absolute w-auto rounded-lg bottom-full right-0 mb-2",
  "bottom-left": "absolute w-auto rounded-lg top-full right-0 mt-2",
  "bottom-right": "absolute w-auto rounded-lg top-full left-0 mt-2",
  center:
    "fixed w-auto rounded-lg top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",

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
    "fixed w-full lg:w-auto left-0 bottom-0 lg:bottom-auto rounded-t-lg lg:rounded-lg pb-4 lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2",
};

const DropdownPopup: React.FC<DropdownPopupProps> = ({
  children,
  className,
  isShown,
  close,
  variant = "top-right",
  avoidKeyboard = false,
  ...props
}) => {
  const baseVariant = variant.replace("responsive-", "");
  // Solo escucha mientras el popup está abierto para no dejar listeners
  // colgados por cada Dropdown montado.
  const keyboardInset = useKeyboardInset(avoidKeyboard && isShown);

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
              "bg-popover shadow-lg z-50 overflow-hidden",
              variants[variant],
              className,
            )}
            // `bottom-0` viene de la variante responsive; el style lo
            // sobrescribe solo cuando el teclado está visible. No usa
            // transform para no pelear con la animación `y` de motion.
            style={keyboardInset > 0 ? { bottom: keyboardInset } : undefined}
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
        "flex items-center gap-2 px-5 py-3 first:pt-4 last:pb-4 hover:bg-secondary-accent active:bg-secondary-accent/70 text-zinc-700 dark:text-zinc-300 cursor-pointer w-full transition-all duration-200",
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

/**
 * Altura del teclado virtual (px) mientras cubre el layout viewport.
 * `window.innerHeight - visualViewport.height` es el inset; se resta
 * `offsetTop` por pinch-zoom. Devuelve 0 en desktop (≥lg), SSR o sin
 * `visualViewport` (navegadores antiguos).
 */
function useKeyboardInset(enabled: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || !window.visualViewport) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        if (window.innerWidth >= 1024) {
          setInset(0);
          return;
        }
        setInset(
          Math.max(0, Math.round(window.innerHeight - vv.height - (vv.offsetTop || 0))),
        );
      });
    };
    update();
    const vv = window.visualViewport;
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [enabled]);
  return inset;
}

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
