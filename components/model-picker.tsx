"use client";

import { useChatContext } from "@/app/providers";
import { Select, useSelect } from "@/components/ui/select";
import { chatModelId, CHAT_MODELS } from "@/lib/ai/models/definition";
import { cn } from "@/lib/utils";
import { getChatConfigurationByModelId } from "@/lib/ai/models/utils";

export const ModelPicker = () => {
  const { selectedModel, setSelectedModel } = useModelPicker();

  return (
    <ModelPickerSelector
      {...{ selectedModel, setSelectedModel, models: CHAT_MODELS }}
    />
  );
};

export interface ModelPickerLoadingProps {
  animated?: boolean;
}

export const ModelPickerLoading: React.FC<ModelPickerLoadingProps> = ({
  animated = true,
}) => {
  return (
    <div
      className={cn("w-42 h-[36px] bg-gray-200 dark:bg-zinc-700 rounded-md", {
        "animate-pulse": animated,
      })}
    />
  );
};

export interface ModelPickerSelectorProps {
  selectedModel: chatModelId;
  setSelectedModel: (model: chatModelId) => void;
  models: chatModelId[];
}

export const ModelPickerSelector: React.FC<ModelPickerSelectorProps> = ({
  selectedModel,
  setSelectedModel,
  models,
}) => {
  const { getSelectTriggerProps, getSelectContentProps, getSelectItemProps } =
    useSelect({
      value: selectedModel,
      onValueChange: setSelectedModel,
    });

  return (
    <Select.Container>
      <Select.Trigger {...getSelectTriggerProps()} className="w-42" />
      <Select.Dropdown {...getSelectContentProps()} className="w-42">
        {models.map((modelId) => (
          <Select.Item {...getSelectItemProps(modelId)} key={modelId}>
            {modelId}
          </Select.Item>
        ))}
      </Select.Dropdown>
    </Select.Container>
  );
};

export const useModelPicker = (): Omit<ModelPickerSelectorProps, "models"> => {
  const { selectedModel, setConfig } = useChatContext();

  const setSelectedModel = (model: chatModelId) => {
    setConfig({
      selectedModel: model,
      ...getChatConfigurationByModelId(model),
    });
  };

  return {
    selectedModel,
    setSelectedModel,
  };
};
