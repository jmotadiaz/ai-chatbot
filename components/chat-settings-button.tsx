import { ClassValue } from "clsx";
import { Settings } from "lucide-react";
import { useChatContext } from "@/app/providers";
import { ChatControl } from "@/components/chat-control";
import { Label } from "@/components/ui/label";
import { InputNumber } from "@/components/ui/input-number";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";

export interface ChatSettingsButtonProps {
  className?: ClassValue;
}

export const ChatSettingsButton = ({ className }: ChatSettingsButtonProps) => {
  const { getDropdownPopupProps, getDropdownTriggerProps } = useDropdown();
  const { temperature, topP, setConfig, selectedModel } = useChatContext();

  const setTemperature = (value: number) => {
    setConfig({ temperature: value });
  };
  const setTopP = (value: number) => {
    setConfig({ topP: value });
  };

  if (
    selectedModel === "Auto Model Workflow" ||
    (temperature === undefined && topP === undefined)
  )
    return null;

  return (
    <Dropdown.Container>
      <ChatControl
        Icon={Settings}
        type="button"
        className={className}
        {...getDropdownTriggerProps()}
      />
      <Dropdown.Popup {...getDropdownPopupProps()} className="space-y-4">
        {temperature !== undefined && (
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
        )}
        {topP !== undefined && (
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
        )}
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
