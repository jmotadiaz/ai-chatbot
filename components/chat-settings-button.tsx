import { useState } from "react";
import { ClassValue } from "clsx";
import { Settings } from "lucide-react";
import { useChatContext } from "@/app/providers";
import { ChatControl } from "@/components/chat-control";
import { Label } from "@/components/ui/label";
import { InputNumber } from "@/components/ui/input-number";

export interface ChatSettingsButtonProps {
  className?: ClassValue;
}

export const ChatSettingsButton = ({ className }: ChatSettingsButtonProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const { temperature, topP, setConfig } = useChatContext();

  const setTemperature = (value: number) => {
    setConfig({ temperature: value });
  };
  const setTopP = (value: number) => {
    setConfig({ topP: value });
  };

  return (
    <>
      <ChatControl
        Icon={Settings}
        type="button"
        onClick={() => setShowSettings(!showSettings)}
        className={className}
      />
      {showSettings && (
        <>
          {/* Overlay to close settings on outside click */}
          <div
            className="fixed inset-0 z-10 bg-transparent"
            onClick={() => setShowSettings(false)}
          />
          {/* Settings dropdown panel */}
          <div className="absolute left-2 bottom-32 w-72 bg-white dark:bg-zinc-800 p-4 rounded-lg shadow-lg z-20">
            <div className="flex items-center justify-between mb-2">
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
            <div className="flex items-center justify-between mb-2">
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
          </div>
        </>
      )}
    </>
  );
};
