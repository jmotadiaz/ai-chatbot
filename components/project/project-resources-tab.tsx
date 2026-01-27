"use client";

import React, { useState, useCallback, useEffect, useTransition } from "react";
import { Plus, Trash2, Search, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addResourceToProjectAction,
  removeResourceFromProjectAction,
  getProjectResourcesAction,
  getUserResourcesNotInProjectAction,
} from "@/lib/features/rag/actions";
import { RAGUploadForm } from "@/components/rag/upload-form";

interface Resource {
  id: string;
  title: string;
  url: string | null;
}

interface ProjectResourcesTabProps {
  projectId: string;
}

export const ProjectResourcesTab: React.FC<ProjectResourcesTabProps> = ({
  projectId,
}) => {
  const [projectResources, setProjectResources] = useState<Resource[]>([]);
  const [availableResources, setAvailableResources] = useState<Resource[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadProjectResources = useCallback(async () => {
    setIsLoadingProject(true);
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
      setIsLoadingProject(false);
    }
  }, [projectId]);

  const loadAvailableResources = useCallback(
    async (filter?: string) => {
      setIsLoadingAvailable(true);
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
        setIsLoadingAvailable(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    loadProjectResources();
  }, [loadProjectResources]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadAvailableResources(searchFilter);
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchFilter, loadAvailableResources]);

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
          // Optionally refresh available resources
          loadAvailableResources(searchFilter);
        }
      } catch (error) {
        console.error("Failed to remove resource from project:", error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 pb-8 lg:px-4">
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Project Resources</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Resources linked to this project will be searched when using RAG in
          chats within this project.
        </p>

        {isLoadingProject ? (
          <div className="text-sm text-zinc-500">Loading resources...</div>
        ) : projectResources.length === 0 ? (
          <div className="text-sm text-zinc-500 italic">
            No resources linked to this project yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-2 max-h-60 overflow-y-auto">
            {projectResources.map((resource) => (
              <li
                key={resource.id}
                className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <LinkIcon className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                  <span className="truncate text-sm">{resource.title}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveResource(resource)}
                  disabled={isPending}
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-700 pt-6">
        <h4 className="text-base font-semibold mb-4">Add Existing Resources</h4>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="Search your resources..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-10"
          />
        </div>

        {isLoadingAvailable ? (
          <div className="text-sm text-zinc-500">Searching resources...</div>
        ) : availableResources.length === 0 ? (
          <div className="text-sm text-zinc-500 italic">
            {searchFilter
              ? "No matching resources found."
              : "No available resources to add."}
          </div>
        ) : (
          <ul className="flex flex-col gap-2 max-h-60 overflow-y-auto">
            {availableResources.map((resource) => (
              <li
                key={resource.id}
                className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <LinkIcon className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                  <span className="truncate text-sm">{resource.title}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAddResource(resource)}
                  disabled={isPending}
                  className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-700 pt-6">
        <h4 className="text-base font-semibold mb-4">Create New Resource</h4>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Upload a file or add a URL to create a new resource and automatically
          link it to this project.
        </p>
        <RAGUploadForm
          projectId={projectId}
          onSuccess={() => {
            loadProjectResources();
            // Also refresh available in case it appears there (though it shouldn't if linked)
          }}
        />
      </div>
    </div>
  );
};
