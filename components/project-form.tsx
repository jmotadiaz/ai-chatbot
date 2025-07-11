"use client";

import React, { useState } from "react";
import { WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useRefinePrompt } from "@/lib/ai/hooks/use-refine-prompt";
import { systemMetaPrompt } from "@/lib/ai/prompts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputNumber } from "@/components/ui/input-number";
import { Button } from "@/components/ui/button";
import Chat from "@/components/chat";
import { ModelPickerSelector } from "@/components/model-picker";
import {
  markdownCommandStyle,
  MarkdownEditor,
} from "@/components/ui/markdown-editor";
import { Tabs, useTabs } from "@/components/ui/tabs";
import { createProject, updateProject } from "@/lib/ai/actions/project";
import { Project } from "@/lib/db/schema";
import { defaultModel, chatModelId } from "@/lib/ai/models";
import { ChatProvider } from "@/app/providers";

const tabs = ["configuration", "testChat"] as const;

export interface ProjectFormProps {
  project?: Project;
}

export const ProjectForm: React.FC<ProjectFormProps> = ({ project }) => {
  const { getPanelProps, getTabProps } = useTabs({ tabs });
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
      const projectData = {
        name: title,
        defaultModel: model,
        defaultTemperature: temperature,
        defaultTopP: topP,
        systemPrompt,
        metaPrompt,
      };

      if (project) {
        await updateProject(project.id, projectData);
        toast.success("Project updated successfully!");
        router.push(`/project/${project.id}`);
      } else {
        const newProject = await createProject(projectData);
        toast.success("Project created successfully!");
        router.push(`/project/${newProject.id}`);
      }
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
      <Tabs.Container className="max-w-4xl mx-auto pt-18 xl:pt-24 my-4">
        <Tabs.Tab {...getTabProps("configuration")}>Configuration</Tabs.Tab>
        <Tabs.Tab {...getTabProps("testChat")}>Test Chat</Tabs.Tab>
      </Tabs.Container>
      <div className="w-full max-w-4xl mx-auto pt-6 px-6">
        <Tabs.Panel {...getPanelProps("configuration")}>
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
        </Tabs.Panel>
        <Tabs.Panel {...getPanelProps("testChat")}>
          <ChatProvider
            temperature={temperature}
            topP={topP}
            selectedModel={model}
            systemPrompt={systemPrompt}
            title={title}
          >
            <Chat />
          </ChatProvider>
        </Tabs.Panel>
      </div>
    </div>
  );
};
