"use client";

import React, {
  useState,
  unstable_ViewTransition as ViewTransition,
  startTransition,
} from "react";
import { ChatProvider } from "@/app/providers";
import { defaultModel, modelID } from "@/lib/ai/providers";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { InputNumber } from "./ui/input-number";
import { Button } from "./ui/button";
import Chat from "./chat-with-client-storage";
import { ModelPickerSelector } from "./model-picker";
import { WandSparkles } from "lucide-react";
import { MarkdownEditor } from "./ui/markdown-editor";
import { useRefinePrompt } from "../lib/ai/hooks";
import { systemMetaPrompt } from "../lib/ai/prompts";

type TabKey = "configuration" | "testChat";

export interface NewProjectProps {
  userId: string;
}

export const NewProject: React.FC<NewProjectProps> = ({ userId }) => {
  const [activeTab, setActiveTab] = useState<TabKey>("configuration");
  const [title, setTitle] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [metaPrompt, setMetaPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [model, setModel] = useState<modelID>(defaultModel);
  const [topP, setTopP] = useState(1.0);
  const { refinePrompt, isLoadingRefinedPrompt } = useRefinePrompt({
    input: systemPrompt,
    setInput: setSystemPrompt,
    metaPrompt: systemMetaPrompt,
  });

  const handleCreateProject = () => {
    console.log({
      title,
      systemPrompt,
      metaPrompt,
      temperature,
      topP,
      userId,
      model,
    });
  };

  return (
    <div className="h-full w-full max-w-4xl mx-auto pt-16 px-6">
      <div className="flex border-b mb-4">
        <button
          type="button"
          className={`px-4 py-2 -mb-px border-b-2 font-medium transition[color,border] duration-300  ${
            activeTab === "configuration"
              ? "border-primary text-primary"
              : "border-transparent text-gray-500 cursor-pointer"
          }`}
          onClick={() => {
            startTransition(() => {
              setActiveTab("configuration");
            });
          }}
        >
          Configuration
        </button>
        <button
          type="button"
          className={`px-4 py-2 -mb-px border-b-2 font-medium transition[color,border] duration-300 ${
            activeTab === "testChat"
              ? "border-primary text-primary"
              : "border-transparent text-gray-500 cursor-pointer"
          }`}
          onClick={() => {
            startTransition(() => {
              setActiveTab("testChat");
            });
          }}
        >
          Test Chat
        </button>
      </div>

      {activeTab === "configuration" && (
        <ViewTransition enter="slide-in" exit="slide-out">
          <div className="flex flex-col gap-6 pb-8">
            <div className="flex flex-col gap-2">
              <Label className="text-lg mb-2" htmlFor="title">
                Title
              </Label>
              <Input
                id="title"
                placeholder="Project title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-lg mb-2">Model</Label>
              <ModelPickerSelector
                selectedModel={model}
                setSelectedModel={setModel}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-lg mb-2" htmlFor="systemPrompt">
                System Prompt
              </Label>
              <MarkdownEditor
                value={systemPrompt}
                onChange={setSystemPrompt}
                isLoading={isLoadingRefinedPrompt}
                extraCommands={[
                  {
                    name: "refine",
                    keyCommand: "refine",
                    value: "refine",
                    icon: (
                      <div
                        className="flex items-center px-1 py-1 cursor-pointer"
                        onClick={refinePrompt}
                      >
                        <WandSparkles size={12} />
                      </div>
                    ),
                  },
                ]}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-lg mb-2" htmlFor="metaPrompt">
                Meta Prompt
              </Label>
              <MarkdownEditor
                value={metaPrompt}
                onChange={setMetaPrompt}
                extraCommands={[
                  {
                    name: "refine",
                    keyCommand: "refine",
                    value: "refine",
                    icon: (
                      <div
                        className="flex items-center px-1 py-1 cursor-pointer"
                        onClick={() => {
                          console.log("refine meta prompt");
                        }}
                      >
                        <WandSparkles size={12} />
                      </div>
                    ),
                  },
                ]}
              />
            </div>
            <div className="flex flex-row gap-6 justify-between lg:justify-start lg:gap-12">
              <div className="flex flex-col gap-2">
                <Label className="text-lg mb-2" htmlFor="temperature">
                  Temperature
                </Label>
                <InputNumber
                  id="temperature"
                  value={temperature}
                  min={0}
                  max={1}
                  step={0.1}
                  onChange={setTemperature}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-lg mb-2" htmlFor="topP">
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
            </div>

            <div className="pt-4 text-right">
              <Button onClick={handleCreateProject}>Create Project</Button>
            </div>
          </div>
        </ViewTransition>
      )}

      {activeTab === "testChat" && (
        <ViewTransition enter="slide-in" exit="slide-out">
          <div>
            <ChatProvider
              temperature={temperature}
              topP={topP}
              selectedModel={model}
              systemPrompt={systemPrompt}
              title={title}
            >
              <Chat />
            </ChatProvider>
          </div>
        </ViewTransition>
      )}
    </div>
  );
};
