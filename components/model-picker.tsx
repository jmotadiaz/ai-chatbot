"use client";
import { modelID, MODELS } from "@/app/(chat)/providers";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface ModelPickerProps {
  /**
   * Currently selected model identifier.
   */
  selectedModel: modelID;
  /**
   * Callback to change the selected model.
   */
  setSelectedModel: (model: modelID) => void;
  /**
   * Optional className for the wrapper container.
   */
  className?: string;
  /**
   * Optional className for the SelectTrigger element to style the dropdown button.
   */
  triggerClassName?: string;
}

export const ModelPicker = ({
  selectedModel,
  setSelectedModel,
  className = "",
  triggerClassName = "",
}: ModelPickerProps) => {
  return (
    <div className={className}>
      <Select value={selectedModel} onValueChange={setSelectedModel}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {MODELS.map((modelId) => (
              <SelectItem key={modelId} value={modelId}>
                {modelId}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};
