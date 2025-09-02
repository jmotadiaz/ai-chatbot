"use client";

import { useChatContext, useSidebarContext } from "@/app/providers";
import { CHAT_MODELS } from "@/lib/ai/models/definition";
import { Label } from "@/components/ui/label";
import { InputNumber } from "@/components/ui/input-number";
import { ModelPickerSelector, useModelPicker } from "@/components/model-picker";
import { cn } from "@/lib/utils";

export const SettingsSidebar = () => {
  const { showSettingsSidebar, setShowSettingsSidebar } = useSidebarContext();
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

  if (selectedModel === "Router") {
    return null;
  }

  return (
    <>
      <div
        onClick={() => setShowSettingsSidebar(false)}
        className={cn(
          "fixed h-screen z-10 top-0 left-0",
          showSettingsSidebar ? "w-full" : "w-0"
        )}
      />
      <div className="fixed h-screen z-20 top-0 right-0">
        <div
          className={cn(
            "flex flex-col h-full bg-gray-50 dark:bg-zinc-900 transition-all duration-300 overflow-hidden shadow-lg border-l border-gray-200 dark:border-zinc-700",
            showSettingsSidebar ? "w-80" : "w-0"
          )}
        >
          <div className="p-4 space-y-6">
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
        </div>
      </div>
    </>
  );
};
