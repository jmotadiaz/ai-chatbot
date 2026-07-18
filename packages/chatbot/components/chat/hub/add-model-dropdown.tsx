"use client";

import React, { useId } from "react";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { cn } from "@/lib/utils/helpers";
import { ModelPickerSelector } from "@/components/chat/model-picker";

export interface AddModelDropdownProps {
  availableModels: chatModelId[];
  onSelectModel: (model: chatModelId) => void;
  triggerLabel: string;
  triggerClassName?: string;
  variant?: "button" | "tile";
}

export const AddModelDropdown: React.FC<AddModelDropdownProps> = ({
  availableModels,
  onSelectModel,
  triggerLabel,
  triggerClassName,
  variant = "button",
}) => {
  const id = useId();

  if (variant === "button") {
    // If you need the button variant later, we can add a small trigger wrapper.
    // For the Hub we primarily use the tile variant.
    return null;
  }

  return (
    <div
      aria-label={triggerLabel}
      className={cn(triggerClassName, "flex items-center justify-center")}
    >
      {availableModels.length > 0 ? (
        <ModelPickerSelector
          id={id}
          selectedModel={availableModels[0]}
          setSelectedModel={(model) => {
            onSelectModel(model);
          }}
          models={availableModels}
          dropdownVariant="responsive-center"
          triggerVariant="button"
        />
      ) : (
        <div className="text-sm text-muted-foreground select-none">
          No compatible models
        </div>
      )}
    </div>
  );
};
