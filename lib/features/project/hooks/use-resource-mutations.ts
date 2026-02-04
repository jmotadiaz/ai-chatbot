"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { Resource } from "./use-project-resources";
import {
  addResourceToProjectAction,
  removeResourceFromProjectAction,
} from "@/lib/features/rag/actions";

interface UseResourceMutationsParams {
  projectId: string;
  setProjectResources: React.Dispatch<React.SetStateAction<Resource[]>>;
  setAvailableResources: React.Dispatch<React.SetStateAction<Resource[]>>;
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
          toast.success("Resource added to project");
        } else {
          toast.error(result.error || "Failed to add resource");
        }
      } catch (error) {
        console.error("Failed to add resource to project:", error);
        toast.error("An error occurred while adding the resource");
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
          setAvailableResources((prev) => [...prev, resource]);
          toast.success("Resource removed from project");
        } else {
          toast.error(result.error || "Failed to remove resource");
        }
      } catch (error) {
        console.error("Failed to remove resource from project:", error);
        toast.error("An error occurred while removing the resource");
      }
    });
  };

  return {
    isPending,
    handleAddResource,
    handleRemoveResource,
  };
};
