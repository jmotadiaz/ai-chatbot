"use client";

import * as React from "react";
import { ChevronUp } from "lucide-react";
import { startTransition, useState } from "react";

import { cn } from "@/lib/utils";
import type { DropdownPopupProps } from "@/components/ui/dropdown";
import { Dropdown } from "@/components/ui/dropdown";

export const useSelect = <T extends string>({
  value,
  onValueChange,
}: {
  value: T;
  onValueChange: (value: T) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleValueChange = (newValue: T) => {
    onValueChange(newValue);
    startTransition(() => {
      setIsOpen(false);
    });
  };

  const toggle = () => {
    startTransition(() => {
      setIsOpen((prev) => !prev);
    });
  };

  const close = () => {
    startTransition(() => {
      setIsOpen(false);
    });
  };

  return {
    getSelectTriggerProps: () => ({
      toggle,
      isOpen,
      value,
    }),
    getSelectContentProps: () => ({
      isShown: isOpen,
      close,
    }),
    getSelectItemProps: (itemValue: T) => ({
      value: itemValue,
      onValueChange: handleValueChange,
      selected: value === itemValue,
    }),
  };
};

export interface SelectContainerProps {
  children: React.ReactNode;
  className?: string;
}

const SelectContainer: React.FC<SelectContainerProps> = ({
  children,
  className,
}) => {
  return (
    <Dropdown.Container className={cn("text-sm", className)}>
      {children}
    </Dropdown.Container>
  );
};

export interface SelectTriggerProps<T extends string>
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isOpen?: boolean;
  value: T;
  className?: string;
  toggle?: () => void;
}

function SelectTriggerComponent<T extends string>({
  className,
  isOpen,
  value,
  toggle,
  ...props
}: SelectTriggerProps<T>) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center space-x-3 font-semibold text-black dark:text-white select-none cursor-pointer",
        className
      )}
      {...props}
      onClick={toggle}
    >
      <span className="block truncate">{value}</span>
      <ChevronUp
        size={16}
        className={cn(
          "transition-transform duration-300",
          isOpen ? "rotate-0" : "rotate-180"
        )}
      />
    </button>
  );
}

export interface SelectContentProps {
  children: React.ReactNode;
  className?: string;
  isShown: boolean;
  close: () => void;
  variant?: DropdownPopupProps["variant"];
}

const SelectDropdownComponent: React.FC<SelectContentProps> = ({
  children,
  className,
  isShown,
  close,
  variant = "bottom",
}) => {
  return (
    <Dropdown.Popup
      isShown={isShown}
      close={close}
      variant={variant}
      className={cn("w-full p-0 overflow-auto", className)}
    >
      <div className="flex flex-col">{children}</div>
    </Dropdown.Popup>
  );
};

export interface SelectItemProps<T extends string>
  extends React.HTMLAttributes<HTMLDivElement> {
  value: T;
  children: React.ReactNode;
  className?: string;
  onValueChange: (value: T) => void;
  selected: boolean;
}

function SelectItemComponent<T extends string>({
  value,
  className,
  children,
  onValueChange,
  selected,
  ...props
}: SelectItemProps<T>): React.ReactNode {
  return (
    <div
      role="option"
      aria-selected={selected}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center px-3 py-2 whitespace-nowrap",
        "hover:bg-secondary-accent-foreground active:bg-secondary-accent-foreground/70",
        selected && "bg-secondary-accent-foreground",
        className
      )}
      onClick={() => {
        onValueChange?.(value);
      }}
      {...props}
    >
      <span className="flex items-center justify-between w-full">
        {children}
      </span>
    </div>
  );
}

export const Select = {
  Container: SelectContainer,
  Trigger: SelectTriggerComponent,
  Dropdown: SelectDropdownComponent,
  Item: SelectItemComponent,
};
