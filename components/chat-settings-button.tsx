import type { ClassValue } from "clsx";
import { Settings2 } from "lucide-react";
import { RAG_TOOL, WEB_SEARCH_TOOL } from "@/lib/ai/tools/types";
import { useChatContext } from "@/app/(chat)/chat-provider";
import { ChatControl } from "@/components/chat-control";
import { Label } from "@/components/ui/label";
import { InputNumber } from "@/components/ui/input-number";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";

export interface ChatSettingsButtonProps {
  className?: ClassValue;
}

export const ChatSettingsButton = ({ className }: ChatSettingsButtonProps) => {
  const { getDropdownPopupProps, getDropdownTriggerProps } = useDropdown();
  const {
    temperature,
    setConfig,
    selectedModel,
    tools,
    hasTool,
    ragMaxResources,
    webSearchNumResults,
  } = useChatContext();

  const setTemperature = (value: number) => setConfig({ temperature: value });
  const setRagMaxResources = (value: number) =>
    setConfig({ ragMaxResources: value });
  const setWebSearchNumResults = (value: number) =>
    setConfig({ webSearchNumResults: value });

  const showToolConfig = tools.length > 0;
  const showTemperatureSetting =
    isDefined(temperature) && selectedModel !== "Router";

  if (!showTemperatureSetting && !showToolConfig) {
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
        {showToolConfig && (
          <>
            {hasTool(RAG_TOOL) && (
              <>
                <Dropdown.Item className="justify-between">
                  <Label className="mr-8 text-nowrap" htmlFor="ragMaxResources">
                    RAG Max Resources
                  </Label>
                  <InputNumber
                    id="ragMaxResources"
                    value={ragMaxResources}
                    min={1}
                    max={50}
                    step={1}
                    onChange={setRagMaxResources}
                  />
                </Dropdown.Item>
              </>
            )}
            {hasTool(WEB_SEARCH_TOOL) && (
              <Dropdown.Item className="justify-between">
                <Label
                  className="mr-8 text-nowrap"
                  htmlFor="webSearchNumResults"
                >
                  Web Search Results
                </Label>
                <InputNumber
                  id="webSearchNumResults"
                  value={webSearchNumResults}
                  min={1}
                  max={10}
                  step={1}
                  onChange={setWebSearchNumResults}
                />
              </Dropdown.Item>
            )}
          </>
        )}
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};

const isDefined = <T,>(value: T | undefined | null): value is T => {
  return value !== undefined && value !== null;
};
