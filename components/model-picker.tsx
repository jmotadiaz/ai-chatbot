"use client";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useChatContext } from "@/app/providers";
import { Select, useSelect } from "@/components/ui/select";
import {
  chatModelId,
  CHAT_MODELS,
  getChatConfigurationByModelId,
} from "@/lib/ai/models";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const ModelPicker = () => {
  const modelPickerProps = useModelPicker();

  return <ModelPickerSelector {...modelPickerProps} />;
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
}

const models = CHAT_MODELS.filter((model) => model !== "Auto Model Workflow");

export const ModelPickerSelector: React.FC<ModelPickerSelectorProps> = ({
  selectedModel,
  setSelectedModel,
}) => {
  const { getSelectTriggerProps, getSelectContentProps, getSelectItemProps } =
    useSelect({
      value: selectedModel,
      onValueChange: setSelectedModel,
    });
  const [previousModel, setPreviousModel] =
    useState<chatModelId>(selectedModel);

  return (
    <div className="flex items-center space-x-4">
      <Button
        variant="icon"
        size="icon"
        className={cn({
          "bg-blue-600 hover:bg-blue-500 dark:hover:bg-blue-500 text-white dark:text-white":
            selectedModel === "Auto Model Workflow",
        })}
        onClick={() => {
          setPreviousModel(selectedModel);
          setSelectedModel(
            selectedModel === "Auto Model Workflow"
              ? previousModel
              : "Auto Model Workflow"
          );
        }}
      >
        <Sparkles className="w-4 h-4" />
      </Button>
      {selectedModel !== "Auto Model Workflow" ? (
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
      ) : (
        <ModelPickerLoading animated={false} />
      )}
    </div>
  );
};

export const useModelPicker = (): ModelPickerSelectorProps => {
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
