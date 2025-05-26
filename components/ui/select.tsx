"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface SelectContextValue {
  open: boolean;
  value?: string;
  onValueChange(value: string): void;
  setOpen(open: boolean): void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext() {
  const context = React.useContext(SelectContext);
  if (!context) {
    throw new Error("Select components must be used within Select");
  }
  return context;
}

export function Select({
  value,
  onValueChange,
  children,
}: {
  value?: string;
  onValueChange?(value: string): void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (
        open &&
        triggerRef.current &&
        contentRef.current &&
        !triggerRef.current.contains(target) &&
        !contentRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  React.useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [open]);

  const handleValueChange = (val: string) => {
    onValueChange?.(val);
  };

  return (
    <SelectContext.Provider
      value={{
        open,
        value,
        onValueChange: handleValueChange,
        setOpen,
        triggerRef,
        contentRef,
      }}
    >
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectGroup({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="select-group"
      className={cn("py-1 flex flex-col", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export const SelectTrigger = React.forwardRef(
  (
    {
      className,
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string },
    forwardedRef: React.Ref<HTMLButtonElement>
  ) => {
    const { open, setOpen, triggerRef } = useSelectContext();

    const ref = React.useCallback(
      (node: HTMLButtonElement) => {
        triggerRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          (
            forwardedRef as React.MutableRefObject<HTMLButtonElement | null>
          ).current = node;
        }
      },
      [forwardedRef, triggerRef]
    );

    return (
      <button
        type="button"
        ref={ref}
        className={cn(
          className,
          "flex items-center cursor-pointer h-8 px-3 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-md shadow-sm"
        )}
        onClick={() => setOpen(!open)}
        {...props}
      >
        {children}
        <ChevronDownIcon className="ml-2 size-4 opacity-50" />
      </button>
    );
  }
);

SelectTrigger.displayName = "SelectTrigger";

export const SelectContent = React.forwardRef(
  (
    {
      className,
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { className?: string },
    forwardedRef: React.Ref<HTMLDivElement>
  ) => {
    const { open, contentRef } = useSelectContext();

    const ref = React.useCallback(
      (node: HTMLDivElement) => {
        contentRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          (
            forwardedRef as React.MutableRefObject<HTMLDivElement | null>
          ).current = node;
        }
      },
      [forwardedRef, contentRef]
    );

    if (!open) {
      return null;
    }

    return (
      <div
        ref={ref}
        data-slot="select-content"
        className={cn(
          "absolute z-50 mt-1 max-h-60 overflow-auto rounded-md border bg-secondary text-secondary-foreground shadow-md",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

SelectContent.displayName = "SelectContent";

export function SelectValue({
  placeholder,
  className,
}: {
  placeholder?: string;
  className?: string;
}) {
  const { value } = useSelectContext();
  return (
    <span data-slot="select-value" className={cn("block truncate", className)}>
      {value ?? placeholder}
    </span>
  );
}

export function SelectItem({
  value,
  className,
  children,
  ...props
}: {
  value: string;
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const { value: selectedValue, onValueChange, setOpen } = useSelectContext();
  const selected = selectedValue === value;

  return (
    <div
      data-slot="select-item"
      role="option"
      aria-selected={selected}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center p-3 py-1.5 text-sm whitespace-nowrap",
        "hover:bg-zinc-300 dark:hover:bg-zinc-500",
        selected && "bg-accent text-accent-foreground",
        className
      )}
      onClick={() => {
        onValueChange(value);
        setOpen(false);
      }}
      {...props}
    >
      <span className="flex items-center justify-center">
        {children}
        {selected && <CheckIcon className="ml-2 size-4" />}
      </span>
    </div>
  );
}

export function SelectLabel({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-sm font-medium", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SelectSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLHRElement>) {
  return (
    <hr
      data-slot="select-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export function SelectScrollUpButton() {
  return null;
}

export function SelectScrollDownButton() {
  return null;
}
