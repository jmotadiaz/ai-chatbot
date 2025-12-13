"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { usePromptRefiner } from "@/lib/features/meta-prompting/hooks/use-prompt-refiner";
import { systemMetaPrompt } from "@/lib/features/meta-prompting/prompts";
import { createProject, updateProject } from "@/lib/features/project/actions";
import type { Project } from "@/lib/features/project/types";
import type { chatModelId } from "@/lib/features/models/constants";
import {
  defaultTemperature,
  CHAT_MODELS,
  defaultWebSearchNumResults,
  defaultRagMaxResources,
} from "@/lib/features/models/constants";
import type { Tool, Tools } from "@/lib/types";

const models = CHAT_MODELS.filter((model) => model !== "Router");

interface UseHandleProjectFormProps {
  project?: Project;
}

export const useHandleProjectForm = ({
  project,
}: UseHandleProjectFormProps = {}) => {
  const router = useRouter();
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
  const [webSearchNumResults, setWebSearchNumResults] = useState<number>(
    project?.webSearchNumResults ?? defaultWebSearchNumResults
  );
  const [ragMaxResources, setRagMaxResources] = useState<number>(
    project?.ragMaxResources ?? defaultRagMaxResources
  );
  const [isCreating, setIsCreating] = useState(false);

  const { refinePrompt, isLoadingRefinedPrompt } = usePromptRefiner({
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
        systemPrompt,
        tools,
        hasPromptRefiner,
        ragMaxResources,
        webSearchNumResults,
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

  return {
    title,
    setTitle,
    systemPrompt,
    setSystemPrompt,
    hasPromptRefiner,
    setHasPromptRefiner,
    tools,
    handleToggleTool,
    hasTool,
    model,
    setModel,
    temperature,
    setTemperature,
    webSearchNumResults,
    setWebSearchNumResults,
    ragMaxResources,
    setRagMaxResources,
    isCreating,
    handleSaveProject,
    refinePrompt,
    isLoadingRefinedPrompt,
    models,
  };
};
