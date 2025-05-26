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
  const { selectedModel, setConfig } = useChatContext();
  return (
    <Select
      value={selectedModel}
      onValueChange={(value) => setConfig({ selectedModel: value as modelID })}
    >
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
};
