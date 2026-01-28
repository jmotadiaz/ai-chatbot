"use client";

import { useTransition } from "react";
import type { Resource } from "./use-project-resources";
import {
  addResourceToProjectAction,
  removeResourceFromProjectAction,
} from "@/lib/features/rag/actions";

interface UseResourceMutationsParams {
  projectId: string;
  setProjectResources: React.Dispatch<React.SetStateAction<Resource[]>>;
  setAvailableResources: React.Dispatch<React.SetStateAction<Resource[]>>;
  loadAvailableResources: (filter?: string) => Promise<void>;
  searchFilter: string;
}

interface UseResourceMutationsReturn {
  isPending: boolean;
  handleAddResource: (resource: Resource) => void;
  handleRemoveResource: (resource: Resource) => void;
}

export const useResourceMutations = ({
  projectId,
  setProjectResources,
  setAvailableResources,
  loadAvailableResources,
  searchFilter,
}: UseResourceMutationsParams): UseResourceMutationsReturn => {
  const [isPending, startTransition] = useTransition();

  const handleAddResource = (resource: Resource) => {
    startTransition(async () => {
      try {
        const result = await addResourceToProjectAction(resource.id, projectId);
        if (result.success) {
          setProjectResources((prev) => [...prev, resource]);
          setAvailableResources((prev) =>
            prev.filter((r) => r.id !== resource.id),
          );
        }
      } catch (error) {
        console.error("Failed to add resource to project:", error);
      }
    });
  };

  const handleRemoveResource = (resource: Resource) => {
    startTransition(async () => {
      try {
        const result = await removeResourceFromProjectAction(
          resource.id,
          projectId,
        );
        if (result.success) {
          setProjectResources((prev) =>
            prev.filter((r) => r.id !== resource.id),
          );
          // Refresh available resources
          loadAvailableResources(searchFilter);
        }
      } catch (error) {
        console.error("Failed to remove resource from project:", error);
      }
    });
  };

  return {
    isPending,
    handleAddResource,
    handleRemoveResource,
  };
};
