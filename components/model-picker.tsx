"use client";
import { useChatContext } from "@/app/providers";
import { Select, useSelect } from "@/components/ui/select";
import {
  chatModelId,
  CHAT_MODELS,
  getChatConfigurationByModelId,
} from "@/lib/ai/models";

export const ModelPicker = () => {
  const modelPickerProps = useModelPicker();

  return <ModelPickerSelector {...modelPickerProps} />;
};

export interface ModelPickerSelectorProps {
  selectedModel: chatModelId;
  setSelectedModel: (model: chatModelId) => void;
}

export const ModelPickerSelector: React.FC<ModelPickerSelectorProps> = ({
  selectedModel,
  setSelectedModel,
}) => {
  const { getSelectTriggerProps, getSelectContentProps, getSelectItemProps } =
    useSelect({
      value: selectedModel,
      onValueChange: setSelectedModel,
    });

  return (
    <Select.Container>
      <Select.Trigger {...getSelectTriggerProps()} className="w-48 xl:w-52" />
      <Select.Dropdown {...getSelectContentProps()} className="w-48 xl:w-52">
        {CHAT_MODELS.map((modelId) => (
          <Select.Item {...getSelectItemProps(modelId)} key={modelId}>
            {modelId}
          </Select.Item>
        ))}
      </Select.Dropdown>
    </Select.Container>
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
