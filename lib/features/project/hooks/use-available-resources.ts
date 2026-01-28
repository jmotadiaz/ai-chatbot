"use client";

import { useState, useCallback, useEffect } from "react";
import type { Resource } from "./use-project-resources";
import { getUserResourcesNotInProjectAction } from "@/lib/features/rag/actions";

interface UseAvailableResourcesParams {
  projectId: string;
}

interface UseAvailableResourcesReturn {
  availableResources: Resource[];
  setAvailableResources: React.Dispatch<React.SetStateAction<Resource[]>>;
  searchFilter: string;
  setSearchFilter: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  loadAvailableResources: (filter?: string) => Promise<void>;
}

export const useAvailableResources = ({
  projectId,
}: UseAvailableResourcesParams): UseAvailableResourcesReturn => {
  const [availableResources, setAvailableResources] = useState<Resource[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadAvailableResources = useCallback(
    async (filter?: string) => {
      setIsLoading(true);
      try {
        const { resources } = await getUserResourcesNotInProjectAction({
          projectId,
          limit: 50,
          offset: 0,
          filter,
        });
        setAvailableResources(resources);
      } catch (error) {
        console.error("Failed to load available resources:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadAvailableResources(searchFilter);
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchFilter, loadAvailableResources]);

  return {
    availableResources,
    setAvailableResources,
    searchFilter,
    setSearchFilter,
    isLoading,
    loadAvailableResources,
  };
};
