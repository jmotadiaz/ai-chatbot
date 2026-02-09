"use client";

import type { ClassValue } from "clsx";
import { Settings2 } from "lucide-react";
import { useChatContext } from "@/components/chat/provider";
import { ChatControl } from "@/components/chat/control";
import { Label } from "@/components/ui/label";
import { InputNumber } from "@/components/ui/input-number";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";

export interface SettingsControlProps {
  className?: ClassValue;
}

const isDefined = <T,>(value: T | undefined | null): value is T => {
  return value !== undefined && value !== null;
};

export const SettingsControl = ({ className }: SettingsControlProps) => {
  const { getDropdownPopupProps, getDropdownTriggerProps } = useDropdown();
  const {
    temperature,
    topP,
    topK,
    setConfig,
    selectedModel,
    webSearchNumResults,
    ragMaxResources,
    minRagResourcesScore,
    agent,
  } = useChatContext();

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

  return (
    <Dropdown.Container data-testid="settings-control-dropdown">
      <ChatControl
        Icon={Settings2}
        type="button"
        className={className}
        aria-label="Model settings"
        {...getDropdownTriggerProps()}
      />
      <Dropdown.Popup
        {...getDropdownPopupProps()}
        variant="responsive-top-left"
        className="space-y-4 min-w-[240px] lg:p-4"
      >
        {showModelConfig && (
          <div className="space-y-4">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Model Settings
            </div>
            {showTemperatureSetting && (
              <div className="flex items-center justify-between">
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
              </div>
            )}
            {showTopPSetting && (
              <div className="flex items-center justify-between">
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
              </div>
            )}
            {showTopKSetting && (
              <div className="flex items-center justify-between">
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
              </div>
            )}
          </div>
        )}
        <div className="my-4 border-t border-muted"></div>
        <div className="space-y-4">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Agent Settings
          </div>
          {agent === "web" && (
            <div className="flex items-center justify-between">
              <Label className="mr-8 text-nowrap" htmlFor="webSearchNumResults">
                Web Search Results
              </Label>
              <InputNumber
                id="webSearchNumResults"
                value={webSearchNumResults}
                min={1}
                max={20}
                step={1}
                onChange={(value) => setConfig({ webSearchNumResults: value })}
              />
            </div>
          )}
          {agent === "rag" && (
            <>
              <div className="flex items-center justify-between">
                <Label className="mr-8 text-nowrap" htmlFor="ragMaxResources">
                  Max RAG Resources
                </Label>
                <InputNumber
                  id="ragMaxResources"
                  value={ragMaxResources}
                  min={1}
                  max={50}
                  step={1}
                  onChange={(value) => setConfig({ ragMaxResources: value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label
                  className="mr-8 text-nowrap"
                  htmlFor="minRagResourcesScore"
                >
                  Min RAG Score
                </Label>
                <InputNumber
                  id="minRagResourcesScore"
                  value={minRagResourcesScore}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(value) =>
                    setConfig({ minRagResourcesScore: value })
                  }
                />
              </div>
            </>
          )}
          {agent === "context7" && (
            <div className="text-sm text-muted-foreground italic">
              No configuration available for this agent.
            </div>
          )}
        </div>
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
