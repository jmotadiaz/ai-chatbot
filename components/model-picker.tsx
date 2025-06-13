"use client";
import { chatModelId, CHAT_MODELS } from "@/lib/ai/providers";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useChatContext } from "../app/providers";

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
    <SelectTrigger className="w-44 xl:w-48">
      <SelectValue placeholder="Select a model" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup className="w-44 xl:w-48">
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
    setConfig({ selectedModel: model });
  };

  return {
    selectedModel,
    setSelectedModel,
  };
};
