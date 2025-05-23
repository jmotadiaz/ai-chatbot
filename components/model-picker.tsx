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
  /**
   * Optional className for the SelectTrigger element to style the dropdown button.
   */
  triggerClassName?: string;
}

export const ModelPicker = ({
  className = "",
  triggerClassName = "h-8 px-3 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-md shadow-sm",
}: ModelPickerProps) => {
  const { selectedModel, setConfig } = useChatContext();
  return (
    <div className={className}>
      <Select
        value={selectedModel}
        onValueChange={(value) =>
          setConfig({ selectedModel: value as modelID })
        }
      >
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
