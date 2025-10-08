"use client";

import React, { useState } from "react";
import { Database, Globe, Save, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useRefinePrompt } from "@/lib/ai/hooks/use-refine-prompt";
import { defaultMetaPrompt, systemMetaPrompt } from "@/lib/ai/prompts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputNumber } from "@/components/ui/input-number";
import { Button } from "@/components/ui/button";
import Chat from "@/components/chat";
import { ModelPickerSelector } from "@/components/model-picker";
import { Tabs, useTabs } from "@/components/ui/tabs";
import { createProject, updateProject } from "@/lib/ai/actions/project";
import type { Project } from "@/lib/db/schema";
import type {
  chatModelId} from "@/lib/ai/models/definition";
import {
  defaultTemperature,
  defaultTopP,
  defaultTopK,
  CHAT_MODELS,
} from "@/lib/ai/models/definition";
import { ChatProvider } from "@/app/(chat)/chat-provider";
import { Toggle } from "@/components/ui/toggle";
import type { Tool, Tools } from "@/lib/ai/tools/types";
import { RAG_TOOL, WEB_SEARCH_TOOL } from "@/lib/ai/tools/types";
import { Textarea } from "@/components/textarea";
import { ChatControl } from "@/components/chat-control";

const tabs = ["configuration", "testChat"] as const;

export interface ProjectFormProps {
  project?: Project;
}

const models = CHAT_MODELS.filter((model) => model !== "Router");

export const ProjectForm: React.FC<ProjectFormProps> = ({ project }) => {
  const { getPanelProps, getTabProps } = useTabs({ tabs });
  const [title, setTitle] = useState(project?.name || "");
  const [systemPrompt, setSystemPrompt] = useState(project?.systemPrompt || "");
  const [hasPromptRefiner, setHasPromptRefiner] = useState(
    project?.hasPromptRefiner || false
  );
  const [tools, setTools] = useState<Tools>((project?.tools as Tools) || []);
  const [model, setModel] = useState<chatModelId>(
    (project?.defaultModel as chatModelId) || models[0]
  );
  const [temperature, setTemperature] = useState<number>(
    project?.defaultTemperature ?? defaultTemperature
  );
  const [topP, setTopP] = useState<number>(project?.defaultTopP ?? defaultTopP);
  const [topK, setTopK] = useState<number>(project?.defaultTopK ?? defaultTopK);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const { refinePrompt, isLoadingRefinedPrompt } = useRefinePrompt({
    input: systemPrompt,
    setInput: setSystemPrompt,
    metaPrompt: systemMetaPrompt,
  });

  const handleToggleTool = (tool: Tool) => () => {
    setTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  };

  const hasTool = (tool: Tool) => tools.includes(tool);

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
        defaultTopK: topK,
        systemPrompt,
        tools,
        hasPromptRefiner,
      };

      if (project) {
        await updateProject(project.id, projectData);
        toast.success("Project updated successfully!");
        router.push(`/project/${project.id}/chat`);
      } else {
        const newProject = await createProject(projectData);
        toast.success("Project created successfully!");
        router.push(`/project/${newProject.id}/chat`);
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
      <div className="px-6">
        <Tabs.Container className="max-w-4xl mx-auto pt-18 xl:pt-24 my-4">
          <Tabs.Tab {...getTabProps("configuration")}>Configuration</Tabs.Tab>
          <Tabs.Tab {...getTabProps("testChat")}>Test Chat</Tabs.Tab>
        </Tabs.Container>
      </div>
      <div className="w-full max-w-4xl mx-auto pt-6">
        <div className="px-6">
          <Tabs.Panel {...getPanelProps("configuration")}>
            <div className="flex flex-col gap-6 pb-8 lg:px-4">
              <div className="grid grid-cols-2 gap-4 items-center">
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
                    models={models}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-lg mb-2" htmlFor="systemPrompt">
                  System Prompt
                </Label>
                <div className="relative">
                  <Textarea
                    input={systemPrompt}
                    isLoadingRefinedPrompt={isLoadingRefinedPrompt}
                    onChangeInput={setSystemPrompt}
                    isLoading={true}
                  />
                  <ChatControl
                    className="absolute bottom-2 right-4 z-2"
                    onClick={refinePrompt}
                    Icon={WandSparkles}
                    disabled={!systemPrompt.trim()}
                    isLoading={isLoadingRefinedPrompt}
                  />
                </div>
              </div>

              <div className="flex flex-col space-y-4">
                <h3 className="text-lg font-semibold mb-6">Tools</h3>
                <div className="flex flex-col gap-4 lg:flex-row lg:gap-10">
                  <Toggle
                    id="rag-tool"
                    checked={hasTool(RAG_TOOL)}
                    onChange={handleToggleTool(RAG_TOOL)}
                  >
                    <Database className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
                    <span className="whitespace-nowrap">
                      RAG (Document Search)
                    </span>
                  </Toggle>

                  <Toggle
                    id="web-search-tool"
                    checked={hasTool(WEB_SEARCH_TOOL)}
                    onChange={handleToggleTool(WEB_SEARCH_TOOL)}
                  >
                    <Globe className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
                    <span className="whitespace-nowrap">Web Search</span>
                  </Toggle>
                  <Toggle
                    id="refine-prompt"
                    checked={hasPromptRefiner}
                    onChange={() => setHasPromptRefiner((prev) => !prev)}
                  >
                    <WandSparkles className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
                    <span className="whitespace-nowrap">Refine Prompt</span>
                  </Toggle>
                </div>
              </div>
              <div className="flex flex-col mt-4">
                <h3 className="text-lg font-semibold mb-4">Settings</h3>
                <div className="flex flex-col lg:flex-row space-y-4 space-x-5 lg:space-x-10">
                  <div className="flex flex-col gap-2">
                    <Label className="text-base" htmlFor="temperature">
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
                    <Label className="text-base" htmlFor="topP">
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
                  <div className="flex flex-col gap-2">
                    <Label className="text-base" htmlFor="topK">
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
                </div>
              </div>

              <div className="pt-4 text-right">
                <Button
                  onClick={handleSaveProject}
                  disabled={isCreating}
                  isLoading={isCreating}
                >
                  <Save />
                  Save Project
                </Button>
              </div>
            </div>
          </Tabs.Panel>
        </div>
        <div className="px-2">
          <Tabs.Panel {...getPanelProps("testChat")}>
            <ChatProvider
              temperature={temperature}
              topP={topP}
              topK={topK}
              selectedModel={model}
              systemPrompt={systemPrompt}
              tools={tools}
              metaPrompt={hasPromptRefiner ? defaultMetaPrompt : undefined}
              title={title}
              preventChatPersistence={true}
            >
              <Chat />
            </ChatProvider>
          </Tabs.Panel>
        </div>
      </div>
    </div>
  );
};
