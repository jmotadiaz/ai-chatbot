"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { usePromptRefiner } from "@/lib/features/meta-prompt/hooks/use-prompt-refiner";
import { systemMetaPrompt } from "@/lib/features/meta-prompt/prompts";
import { createProject, updateProject } from "@/lib/features/project/actions";
import type { Project } from "@/lib/features/project/types";
import {
  CHAT_MODELS,
  defaultWebSearchNumResults,
  defaultRagMaxResources,
  getChatConfigurationByModelId,
} from "@/lib/features/foundation-model/config";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import type { Tool, Tools } from "@/lib/features/chat/types";

const models = CHAT_MODELS.filter((model) => model !== "Router");

// Check if an existing project has custom advanced settings configured
const hasAdvancedConfig = (project?: Project): boolean => {
  if (!project) return false;
  return (
    project.defaultTemperature !== null ||
    project.defaultTopP !== null ||
    project.defaultTopK !== null ||
    (project.ragMaxResources !== null &&
      project.ragMaxResources !== defaultRagMaxResources) ||
    (project.webSearchNumResults !== null &&
      project.webSearchNumResults !== defaultWebSearchNumResults)
  );
};

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

  // Advanced settings - collapsible state
  // Closed by default for new projects, open if editing a project with custom config
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(() =>
    hasAdvancedConfig(project)
  );

  // Get model config for defaults
  const getModelConfig = useCallback(
    (modelId: chatModelId) => getChatConfigurationByModelId(modelId),
    []
  );

  const modelConfig = getModelConfig(model);

  // Temperature, topP, topK states - undefined means use model defaults
  const [temperature, setTemperature] = useState<number | undefined>(
    project?.defaultTemperature ?? undefined
  );
  const [topP, setTopP] = useState<number | undefined>(
    project?.defaultTopP ?? undefined
  );
  const [topK, setTopK] = useState<number | undefined>(
    project?.defaultTopK ?? undefined
  );

  const [webSearchNumResults, setWebSearchNumResults] = useState<
    number | undefined
  >(project?.webSearchNumResults ?? undefined);
  const [ragMaxResources, setRagMaxResources] = useState<number | undefined>(
    project?.ragMaxResources ?? undefined
  );
  const [isCreating, setIsCreating] = useState(false);

  // Handle advanced toggle - when opening, initialize with model defaults
  const handleAdvancedToggle = useCallback(() => {
    setIsAdvancedOpen((prev) => {
      const newOpen = !prev;
      if (newOpen) {
        // Opening: initialize with model defaults if not already set
        setTemperature((t) => t ?? modelConfig.temperature);
        setTopP((p) => p ?? modelConfig.topP);
        setTopK((k) => k ?? modelConfig.topK);
        setRagMaxResources((r) => r ?? defaultRagMaxResources);
        setWebSearchNumResults((w) => w ?? defaultWebSearchNumResults);
      } else {
        // Closing: clear values to use model defaults
        setTemperature(undefined);
        setTopP(undefined);
        setTopK(undefined);
        setRagMaxResources(undefined);
        setWebSearchNumResults(undefined);
      }
      return newOpen;
    });
  }, [modelConfig]);

  const { refinePrompt, isLoadingRefinedPrompt, undo, hasPreviousMessage } =
    usePromptRefiner({
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
      // Only include advanced settings if collapsible is open
      const projectData = {
        name: title,
        defaultModel: model,
        defaultTemperature: isAdvancedOpen ? temperature : undefined,
        defaultTopP: isAdvancedOpen ? topP : undefined,
        defaultTopK: isAdvancedOpen ? topK : undefined,
        systemPrompt,
        tools,
        hasPromptRefiner,
        ragMaxResources: isAdvancedOpen ? ragMaxResources : undefined,
        webSearchNumResults: isAdvancedOpen ? webSearchNumResults : undefined,
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
    // Advanced settings
    isAdvancedOpen,
    handleAdvancedToggle,
    modelConfig,
    temperature,
    setTemperature,
    topP,
    setTopP,
    topK,
    setTopK,
    // Tool config
    webSearchNumResults,
    setWebSearchNumResults,
    ragMaxResources,
    setRagMaxResources,
    isCreating,
    handleSaveProject,
    refinePrompt,
    isLoadingRefinedPrompt,
    models,
    undo,
    hasPreviousMessage,
  };
};
