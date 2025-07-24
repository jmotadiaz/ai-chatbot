import {
  unstable_ViewTransition as ViewTransition,
  startTransition,
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
        <ViewTransition enter="reveal-pop" exit="shrink-out">
          <div className="fixed inset-0 z-10 bg-transparent" onClick={close} />
          <div
            className={cn(
              "absolute left-0 bg-secondary p-4 rounded-lg shadow-lg z-20 overflow-hidden",
              variant === "top" ? "bottom-full mb-2" : "top-full mt-2",
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

const Dropdown = {
  Container: DropdownContainer,
  Popup: DropdownPopup,
};

const useDropdown = () => {
  const [isShown, setIsShown] = useState(false);

  const toggle = () => {
    startTransition(() => {
      setIsShown((prev) => !prev);
    });
  };

  const close = () => {
    startTransition(() => {
      setIsShown(false);
    });
  };

  return {
    getDropdownTriggerProps: () => ({ onClick: toggle }),
    getDropdownPopupProps: () => ({ isShown, close }),
    isShown,
  };
};

export { Dropdown, useDropdown };
