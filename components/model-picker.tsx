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

export const ModelPicker = () => {
  const { selectedModel, setConfig } = useChatContext();
  return (
    <Select
      value={selectedModel}
      onValueChange={(value) => setConfig({ selectedModel: value as modelID })}
    >
      <SelectTrigger className="w-44">
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup className="w-44">
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
