"use client";

import React from "react";
import { Plus, Trash2, Search, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RAGUploadForm } from "@/components/rag/upload-form";
import {
  useProjectResources,
  type Resource,
} from "@/lib/features/project/hooks/use-project-resources";
import { useAvailableResources } from "@/lib/features/project/hooks/use-available-resources";
import { useResourceMutations } from "@/lib/features/project/hooks/use-resource-mutations";
import { DotsLoadingIcon } from "@/components/ui/icons";

interface ProjectResourcesTabProps {
  projectId: string;
  initialProjectResources: Resource[];
  initialProjectHasMore: boolean;
  initialAvailableResources: Resource[];
  initialAvailableHasMore: boolean;
}

export const ProjectResourcesTab: React.FC<ProjectResourcesTabProps> = ({
  projectId,
  initialProjectResources,
  initialProjectHasMore,
  initialAvailableResources,
  initialAvailableHasMore,
}) => {
  const {
    projectResources,
    setProjectResources,
    isLoading: isLoadingProject,
    scrollContainer: scrollContainerProject,
    hasMore: projectHasMore,
    getProjectItemProps,
  } = useProjectResources({
    projectId,
    initialResources: initialProjectResources,
    initialHasMore: initialProjectHasMore,
  });

  const {
    availableResources,
    setAvailableResources,
    searchFilter,
    setSearchFilter,
    isLoading: isLoadingAvailable,
    scrollContainer: scrollContainerAvailable,
    hasMore: availableHasMore,
    getAvailableItemProps,
  } = useAvailableResources({
    projectId,
    initialResources: initialAvailableResources,
    initialHasMore: initialAvailableHasMore,
  });

  const { isPending, handleAddResource, handleRemoveResource } =
    useResourceMutations({
      projectId,
      setProjectResources,
      setAvailableResources,
    });

  return (
    <div className="flex flex-col gap-6 pb-8 lg:px-4">
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Project Resources</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Resources linked to this project will be searched when using RAG in
          chats within this project.
        </p>

        {isLoadingProject && projectResources.length === 0 ? (
          <div className="text-sm text-zinc-500">Loading resources...</div>
        ) : projectResources.length === 0 ? (
          <div className="text-sm text-zinc-500 italic">
            No resources linked to this project yet.
          </div>
        ) : (
          <>
            <ul
              ref={scrollContainerProject}
              className="flex flex-col gap-2 max-h-80 overflow-y-auto scrollbar-none"
            >
              {projectResources.map((resource, index) => {
                const { loaderRef } = getProjectItemProps(index);
                return (
                  <li
                    key={resource.id}
                    ref={loaderRef}
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
                );
              })}
              {projectHasMore && (
                <li className="flex items-center justify-center p-3">
                  <DotsLoadingIcon className="w-4 h-4" />
                </li>
              )}
            </ul>
          </>
        )}
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-700 pt-6">
        <h4 className="text-lg font-semibold mb-4">Add Existing Resources</h4>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="Search your resources..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-10"
          />
        </div>

        {isLoadingAvailable && availableResources.length === 0 ? (
          <div className="text-sm text-zinc-500">Searching resources...</div>
        ) : availableResources.length === 0 ? (
          <div className="text-sm text-zinc-500 italic">
            {searchFilter
              ? "No matching resources found."
              : "No available resources to add."}
          </div>
        ) : (
          <>
            <ul
              ref={scrollContainerAvailable}
              className="flex flex-col gap-2 max-h-80 overflow-y-auto scrollbar-none"
            >
              {availableResources.map((resource, index) => {
                const { loaderRef } = getAvailableItemProps(index);
                return (
                  <li
                    key={resource.id}
                    ref={loaderRef}
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
                );
              })}
              {availableHasMore && (
                <li className="flex items-center justify-center p-3">
                  <DotsLoadingIcon className="w-4 h-4" />
                </li>
              )}
            </ul>
          </>
        )}
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-700 pt-6">
        <h4 className="text-lg font-semibold mb-4">Create New Resource</h4>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Upload a file or add a URL to create a new resource and automatically
          link it to this project.
        </p>
        <RAGUploadForm projectId={projectId} />
      </div>
    </div>
  );
};
