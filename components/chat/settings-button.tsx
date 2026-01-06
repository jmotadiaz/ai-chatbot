import type { ClassValue } from "clsx";
import { Settings2 } from "lucide-react";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { WEB_SEARCH_TOOL } from "@/lib/features/web-search/constants";
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
  const {
    temperature,
    topP,
    topK,
    setConfig,
    selectedModel,
    tools,
    hasTool,
    ragMaxResources,
    webSearchNumResults,
  } = useChatContext();

  const setTemperature = (value: number) => setConfig({ temperature: value });
  const setTopP = (value: number) => setConfig({ topP: value });
  const setTopK = (value: number) => setConfig({ topK: value });
  const setRagMaxResources = (value: number) =>
    setConfig({ ragMaxResources: value });
  const setWebSearchNumResults = (value: number) =>
    setConfig({ webSearchNumResults: value });

  const isRouter = selectedModel === "Router";
  const showToolConfig = tools.length > 0;

  // Model config fields only shown for non-Router models and only if the model has them defined
  const showTemperatureSetting = !isRouter && isDefined(temperature);
  const showTopPSetting = !isRouter && isDefined(topP);
  const showTopKSetting = !isRouter && isDefined(topK);

  const showModelConfig = showTemperatureSetting || showTopPSetting || showTopKSetting;

  if (!showModelConfig && !showToolConfig) {
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
        {showToolConfig && (
          <>
            {hasTool(RAG_TOOL) && (
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
