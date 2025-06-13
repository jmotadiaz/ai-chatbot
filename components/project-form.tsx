"use client";

import React, {
  useState,
  unstable_ViewTransition as ViewTransition,
  startTransition,
} from "react";
import { ChatProvider } from "@/app/providers";
import { defaultModel, chatModelId } from "@/lib/ai/providers";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { InputNumber } from "./ui/input-number";
import { Button } from "./ui/button";
import Chat from "./chat-with-client-storage";
import { ModelPickerSelector } from "./model-picker";
import { WandSparkles } from "lucide-react";
import { markdownCommandStyle, MarkdownEditor } from "./ui/markdown-editor";
import { useRefinePrompt } from "../lib/ai/hooks";
import { systemMetaPrompt } from "../lib/ai/prompts";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Project } from "@/lib/db/schema";

type TabKey = "configuration" | "testChat";

export interface ProjectFormProps {
  project?: Project;
}

export const ProjectForm: React.FC<ProjectFormProps> = ({ project }) => {
  const [activeTab, setActiveTab] = useState<TabKey>("configuration");
  const [title, setTitle] = useState(project?.name || "");
  const [systemPrompt, setSystemPrompt] = useState(project?.systemPrompt || "");
  const [metaPrompt, setMetaPrompt] = useState(project?.metaPrompt || "");
  const [model, setModel] = useState<chatModelId>(
    (project?.defaultModel as chatModelId) || defaultModel
  );
  const [temperature, setTemperature] = useState(
    project?.defaultTemperature || 0.2
  );
  const [topP, setTopP] = useState(project?.defaultTopP || 0.95);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const { refinePrompt, isLoadingRefinedPrompt } = useRefinePrompt({
    input: systemPrompt,
    setInput: setSystemPrompt,
    metaPrompt: systemMetaPrompt,
  });

  const handleSaveProject = async () => {
    if (!title.trim() || !systemPrompt.trim()) {
      toast.error("Please fill in required fields (Title and System Prompt)");
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch(
        project ? `/api/project/${project.id}` : "/api/project",
        {
          method: project ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: title,
            defaultModel: model,
            defaultTemperature: temperature,
            defaultTopP: topP,
            systemPrompt,
            metaPrompt: metaPrompt,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create project");
      }

      const {
        project: { id },
      } = await response.json();
      toast.success("Project created successfully!");
      router.push(`/project/${id}`);
    } catch (error) {
      console.error("Error creating project:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create project"
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="overflow-x-hidden h-full">
      <div className="flex w-full max-w-4xl mx-auto lg:fixed lg:z-100 lg:left-0 lg:right-0 top-0 border-b pt-16 lg:pt-0 px-6 my-4">
        <button
          type="button"
          className={`px-4 py-2 border-b-2 font-medium transition[color,border] duration-300  ${
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
          className={`px-4 py-2 border-b-2 font-medium transition[color,border] duration-300 ${
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
      <div className="w-full max-w-4xl mx-auto pt-2 lg:pt-18 px-6">
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
                      icon: (
                        <div
                          className={markdownCommandStyle}
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
                <MarkdownEditor value={metaPrompt} onChange={setMetaPrompt} />
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
                    max={2}
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
                    step={0.01}
                    onChange={setTopP}
                  />
                </div>
              </div>

              <div className="pt-4 text-right">
                <Button onClick={handleSaveProject} disabled={isCreating}>
                  {isCreating ? "Saving..." : "Save Project"}
                </Button>
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
    </div>
  );
};
