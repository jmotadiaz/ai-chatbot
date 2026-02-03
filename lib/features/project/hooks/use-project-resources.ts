"use client";

import { useState, useCallback, useEffect } from "react";
import { getProjectResourcesAction } from "@/lib/features/rag/actions";

export interface Resource {
  id: string;
  title: string;
  url: string | null;
}

interface UseProjectResourcesParams {
  projectId: string;
}

interface UseProjectResourcesReturn {
  projectResources: Resource[];
  setProjectResources: React.Dispatch<React.SetStateAction<Resource[]>>;
  isLoading: boolean;
  loadProjectResources: () => Promise<void>;
}

export const useProjectResources = ({
  projectId,
}: UseProjectResourcesParams): UseProjectResourcesReturn => {
  const [projectResources, setProjectResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadProjectResources = useCallback(async () => {
    if (!projectId) {
      return;
    }
    setIsLoading(true);
    try {
      const { resources } = await getProjectResourcesAction({
        projectId,
        limit: 50,
        offset: 0,
      });
      setProjectResources(resources);
    } catch (error) {
      console.error("Failed to load project resources:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProjectResources();
  }, [loadProjectResources]);

  return {
    projectResources,
    setProjectResources,
    isLoading,
    loadProjectResources,
  };
};
