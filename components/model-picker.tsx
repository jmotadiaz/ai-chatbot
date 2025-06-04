"use client";
import { modelID, MODELS } from "@/lib/ai/providers";
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
  selectedModel: modelID;
  setSelectedModel: (model: modelID) => void;
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
        {MODELS.map((modelId) => (
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

  const setSelectedModel = (model: modelID) => {
    setConfig({ selectedModel: model });
  };

  return {
    selectedModel,
    setSelectedModel,
  };
};
