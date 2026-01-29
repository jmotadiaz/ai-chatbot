import type { ClassValue } from "clsx";
import { Settings2 } from "lucide-react";
import { useChatContext } from "@/components/chat/provider";
import { ChatControl } from "@/components/chat/control";
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

  const setTemperature = (value: number) => setConfig({ temperature: value });
  const setTopP = (value: number) => setConfig({ topP: value });
  const setTopK = (value: number) => setConfig({ topK: value });

  const isRouter = selectedModel === "Router";

  // Model config fields only shown for non-Router models and only if the model has them defined
  const showTemperatureSetting = !isRouter && isDefined(temperature);
  const showTopPSetting = !isRouter && isDefined(topP);
  const showTopKSetting = !isRouter && isDefined(topK);

  const showModelConfig =
    showTemperatureSetting || showTopPSetting || showTopKSetting;

  if (!showModelConfig) {
    return null;
  }

  return (
    <Dropdown.Container data-testid="chat-settings-dropdown">
      <ChatControl
        Icon={Settings2}
        type="button"
        className={className}
        aria-label="Chat settings"
        {...getDropdownTriggerProps()}
      />
      <Dropdown.Popup
        {...getDropdownPopupProps()}
        variant="top-left"
        className="space-y-4"
      >
        {showTemperatureSetting && (
          <Dropdown.Item className="justify-between">
            <Label className="mr-8 text-nowrap" htmlFor="temperature">
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
        )}
        {showTopPSetting && (
          <Dropdown.Item className="justify-between">
            <Label className="mr-8 text-nowrap" htmlFor="topP">
              Top P
            </Label>
            <InputNumber
              id="topP"
              value={topP}
              min={0}
              max={1}
              step={0.1}
              onChange={setTopP}
            />
          </Dropdown.Item>
        )}
        {showTopKSetting && (
          <Dropdown.Item className="justify-between">
            <Label className="mr-8 text-nowrap" htmlFor="topK">
              Top K
            </Label>
            <InputNumber
              id="topK"
              value={topK}
              min={0}
              max={100}
              step={1}
              onChange={setTopK}
            />
          </Dropdown.Item>
        )}
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};

const isDefined = <T,>(value: T | undefined | null): value is T => {
  return value !== undefined && value !== null;
};
