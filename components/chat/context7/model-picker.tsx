"use client";

import React from "react";
import { ModelPickerSelector } from "@/components/chat/model-picker";
import { useContext7ChatContext } from "@/components/chat/context7/provider";
import type { chatModelId } from "@/lib/features/foundation-model/config";

interface ModelPickerProps {
  id: string;
}

export const Context7ModelPicker: React.FC<ModelPickerProps> = ({ id }) => {
  const { selectedModel, setConfig, availableModels } = useContext7ChatContext();

  const setSelectedModel = (model: chatModelId) => {
    setConfig({
      selectedModel: model,
    });
  };

  return (
    <ModelPickerSelector
      id={id}
      selectedModel={selectedModel}
      setSelectedModel={setSelectedModel}
      models={availableModels}
    />
  );
};
