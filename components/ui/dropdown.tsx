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
              "fixed lg:absolute w-full lg:w-auto left-0 bottom-0 bg-secondary p-4 rounded-t-lg lg:rounded-lg shadow-lg z-20 overflow-hidden",
              variant === "top"
                ? "lg:bottom-full lg:mb-2"
                : "top-none lg:top-full lg:mt-2",
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
