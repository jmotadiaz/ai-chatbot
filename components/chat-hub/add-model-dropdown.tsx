"use client";

import React, { useEffect, useId, useState } from "react";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { cn } from "@/lib/utils/helpers";
import { ModelPickerSelector } from "@/components/model-picker";

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
  const [selectedModel, setSelectedModel] = useState<chatModelId | null>(null);

  useEffect(() => {
    if (!availableModels.length) {
      setSelectedModel(null);
      return;
    }
    setSelectedModel((prev) =>
      prev && availableModels.includes(prev) ? prev : availableModels[0]
    );
  }, [availableModels]);

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
      {selectedModel ? (
        <ModelPickerSelector
          id={id}
          selectedModel={selectedModel}
          setSelectedModel={(model) => {
            onSelectModel(model);
            setSelectedModel(model);
          }}
          models={availableModels}
          dropdownVariant="center"
        />
      ) : (
        <div className="text-sm text-muted-foreground select-none">
          No compatible models
        </div>
      )}
    </div>
  );
};


