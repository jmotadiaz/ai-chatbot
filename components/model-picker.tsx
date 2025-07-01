"use client";
import { useChatContext } from "@/app/providers";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  chatModelId,
  CHAT_MODELS,
  getChatConfigurationByModelId,
} from "@/lib/ai/providers";

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
}) => (
  <Select value={selectedModel} onValueChange={setSelectedModel}>
    <SelectTrigger className="w-48 xl:w-52">
      <SelectValue placeholder="Select a model" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup className="w-48 xl:w-52">
        {CHAT_MODELS.map((modelId) => (
          <SelectItem key={modelId} value={modelId}>
            {modelId}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
);

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
