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
import { useChatContext } from "../app/providers";

interface ModelPickerProps {
  /**
   * Optional className for the wrapper container.
   */
  className?: string;
}

export const ModelPicker = ({ className = "" }: ModelPickerProps) => {
  const { selectedModel, setConfig } = useChatContext();
  return (
    <div className={className}>
      <Select
        value={selectedModel}
        onValueChange={(value) =>
          setConfig({ selectedModel: value as modelID })
        }
      >
        <SelectTrigger>
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
