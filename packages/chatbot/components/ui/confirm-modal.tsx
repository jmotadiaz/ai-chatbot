"use client";

import React, { startTransition, useCallback, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ButtonProps } from "@/components/ui/button";
import { Button } from "@/components/ui/button"; // Assuming button component exists

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
  const handleConfirm = () => {
    startTransition(() => {
      onConfirm();
      onClose();
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="confirm-modal-backdrop"
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() =>
              startTransition(() => {
                onClose();
              })
            }
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          />

          <motion.div
            key="confirm-modal-container"
            className="fixed z-60 top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] w-full max-w-md px-4"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
