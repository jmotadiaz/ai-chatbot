import { ClassValue } from "clsx";
import { Settings2 } from "lucide-react";
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
  const { temperature, topP, topK, setConfig, selectedModel } =
    useChatContext();

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
    <Dropdown.Container>
      <ChatControl
        Icon={Settings2}
        type="button"
        className={className}
        {...getDropdownTriggerProps()}
      />
      <Dropdown.Popup {...getDropdownPopupProps()} className="space-y-4">
        <Dropdown.Item className="justify-between">
          <Label className="mr-4" htmlFor="temperature">
            Temperature
          </Label>
          <InputNumber
            id="temperature"
            value={temperature}
            min={0}
            max={2}
            step={0.1}
            onChange={setTemperature}
          />
        </Dropdown.Item>
        <Dropdown.Item className="justify-between">
          <Label className="mr-4" htmlFor="topP">
            Top P
          </Label>
          <InputNumber
            id="topP"
            value={topP}
            min={0}
            max={1}
            step={0.01}
            onChange={setTopP}
          />
        </Dropdown.Item>
        <Dropdown.Item className="justify-between">
          <Label className="mr-4" htmlFor="topK">
            Top K
          </Label>
          <InputNumber
            id="topK"
            value={topK}
            min={0}
            max={100}
            step={5}
            onChange={setTopK}
          />
        </Dropdown.Item>
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
