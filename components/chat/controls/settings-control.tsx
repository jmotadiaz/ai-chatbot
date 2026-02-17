"use client";

import type { ClassValue } from "clsx";
import { Settings2 } from "lucide-react";
import { ChatControl } from "@/components/chat/control";
import { Label } from "@/components/ui/label";
import { InputNumber } from "@/components/ui/input-number";
import {
  Dropdown,
  DropdownPopupProps,
  useDropdown,
} from "@/components/ui/dropdown";
import type { SetChatConfig } from "@/lib/features/chat/hooks/hook-types";
import type { Agent } from "@/lib/features/chat/types";

export interface SettingsControlProps {
  className?: ClassValue;
  dropdownVariant?: DropdownPopupProps["variant"];
  temperature?: number;
  topP?: number;
  topK?: number;
  webSearchNumResults?: number;
  ragMaxResources?: number;
  minRagResourcesScore?: number;
  agent?: Agent;
  setConfig: SetChatConfig;
}

const isDefined = <T,>(value: T | undefined | null): value is T => {
  return value !== undefined && value !== null;
};

export const SettingsControl = ({
  className,
  dropdownVariant = "responsive-top-left",
  temperature,
  topP,
  topK,
  webSearchNumResults,
  ragMaxResources,
  minRagResourcesScore,
  agent,
  setConfig,
}: SettingsControlProps) => {
  const { getDropdownPopupProps, getDropdownTriggerProps } = useDropdown();

  const setTemperature = (value: number) => setConfig({ temperature: value });
  const setTopP = (value: number) => setConfig({ topP: value });
  const setTopK = (value: number) => setConfig({ topK: value });

  // Model config fields only shown for non-Router models and only if the model has them defined
  const showTemperatureSetting = isDefined(temperature);
  const showTopPSetting = isDefined(topP);
  const showTopKSetting = isDefined(topK);

  const showModelConfig =
    showTemperatureSetting || showTopPSetting || showTopKSetting;

  // Agent config fields only shown for agents with configuration
  const showAgentConfig = agent === "web" || agent === "rag";

  return (
    <Dropdown.Container data-testid="settings-control-dropdown">
      <ChatControl
        Icon={Settings2}
        type="button"
        aria-label="Model settings"
        className={className}
        {...getDropdownTriggerProps()}
      />
      <Dropdown.Popup {...getDropdownPopupProps()} variant={dropdownVariant}>
        <div className="p-4">
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
                    value={temperature as number}
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
                    value={topP as number}
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
                    value={topK as number}
                    min={0}
                    max={100}
                    step={1}
                    onChange={setTopK}
                  />
                </div>
              )}
            </div>
          )}
          {showModelConfig && showAgentConfig && (
            <div className="my-4 border-t border-muted"></div>
          )}
          {showAgentConfig && (
            <div className="space-y-4">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Agent Settings
              </div>
              {agent === "web" && (
                <div className="flex items-center justify-between">
                  <Label
                    className="mr-8 text-nowrap"
                    htmlFor="webSearchNumResults"
                  >
                    Web Search Results
                  </Label>
                  <InputNumber
                    id="webSearchNumResults"
                    value={webSearchNumResults as number}
                    min={1}
                    max={20}
                    step={1}
                    onChange={(value) =>
                      setConfig({ webSearchNumResults: value })
                    }
                  />
                </div>
              )}
              {agent === "rag" && (
                <>
                  <div className="flex items-center justify-between">
                    <Label
                      className="mr-8 text-nowrap"
                      htmlFor="ragMaxResources"
                    >
                      Max RAG Resources
                    </Label>
                    <InputNumber
                      id="ragMaxResources"
                      value={ragMaxResources as number}
                      min={1}
                      max={50}
                      step={1}
                      onChange={(value) =>
                        setConfig({ ragMaxResources: value })
                      }
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
                      value={minRagResourcesScore as number}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(value) =>
                        setConfig({ minRagResourcesScore: value })
                      }
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </Dropdown.Popup>
    </Dropdown.Container>
  );
};
