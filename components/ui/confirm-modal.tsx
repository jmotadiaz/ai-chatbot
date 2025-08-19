"use client";

import React, {
  unstable_ViewTransition as ViewTransition,
  startTransition,
  useCallback,
  useState,
} from "react";
import { Button, ButtonProps } from "@/components/ui/button"; // Assuming button component exists

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  confirmButtonVariant?: ButtonProps["variant"];
  title?: string;
  message?: string;
  confirmButtonText?: string;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  title = "Confirm Deletion",
  message = "Are you sure you want to delete this item?",
  confirmButtonVariant = "destructive",
  confirmButtonText = "Delete",
}) => {
  if (!isOpen) {
    return null;
  }

  const handleConfirm = () => {
    startTransition(() => {
      onConfirm();
      onClose();
    });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={() =>
          startTransition(() => {
            onClose();
          })
        }
      ></div>
      <ViewTransition enter="slide-up" exit="slide-up">
        <div className="fixed z-60 top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] w-full max-w-md px-4">
          <div className="bg-background text-foreground p-6 rounded-lg shadow-xl">
            <h3 className="text-lg font-semibold mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground mb-4">{message}</p>
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  startTransition(() => {
                    onClose();
                  });
                }}
              >
                Cancel
              </Button>
              <Button
                variant={confirmButtonVariant}
                onClick={handleConfirm}
                isLoading={isLoading}
              >
                {confirmButtonText}
              </Button>
            </div>
          </div>
        </div>
      </ViewTransition>
    </>
  );
};

export const useConfirmModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const openModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const onClose = () => {
    closeModal();
  };

  return {
    openModal,
    closeModal,
    modalProps: () => ({
      isOpen,
      onClose,
    }),
    triggerModalProps: ({
      onClick,
    }: {
      onClick?: React.MouseEventHandler;
    } = {}) => ({
      onClick: (e: React.MouseEvent) => {
        openModal();
        onClick?.(e);
      },
    }),
  };
};
