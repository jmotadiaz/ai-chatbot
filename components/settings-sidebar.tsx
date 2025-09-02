"use client";

import { useChatContext, useSidebarContext } from "@/app/providers";
import { CHAT_MODELS } from "@/lib/ai/models/definition";
import { Label } from "@/components/ui/label";
import { InputNumber } from "@/components/ui/input-number";
import { ModelPickerSelector, useModelPicker } from "@/components/model-picker";

export const SettingsSidebar = () => {
  const { showSettingsSidebar } = useSidebarContext();
  const { temperature, topP, topK, setConfig, selectedModel } = useChatContext();
  const { selectedModel: pickerModel, setSelectedModel } = useModelPicker();

  const setTemperature = (value: number) => {
    setConfig({ temperature: value });
  };
  const setTopP = (value: number) => {
    setConfig({ topP: value });
  };
  const setTopK = (value: number) => {
    setConfig({ topK: value });
  };

  if (!showSettingsSidebar || selectedModel === "Router") {
    return null;
  }

  return (
    <div className="w-80 bg-gray-50 dark:bg-zinc-900 p-4 space-y-6 border-l border-gray-200 dark:border-zinc-700">
      <h2 className="text-lg font-semibold">Settings</h2>

      <div>
        <Label>Model</Label>
        <ModelPickerSelector
          selectedModel={pickerModel}
          setSelectedModel={setSelectedModel}
          models={CHAT_MODELS}
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-md font-semibold">Parameters</h3>
        <div className="flex items-center justify-between space-x-4">
          <Label htmlFor="temperature">Temperature</Label>
          <InputNumber
            id="temperature"
            value={temperature}
            min={0}
            max={2}
            step={0.1}
            onChange={setTemperature}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="topP">Top P</Label>
          <InputNumber
            id="topP"
            value={topP}
            min={0}
            max={1}
            step={0.01}
            onChange={setTopP}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="topK">Top K</Label>
          <InputNumber
            id="topK"
            value={topK}
            min={0}
            max={100}
            step={5}
            onChange={setTopK}
          />
        </div>
      </div>
    </div>
  );
};
