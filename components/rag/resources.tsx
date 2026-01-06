"use client";

import { SearchIcon } from "lucide-react";
import { RagResourceItem } from "./resource-item";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmModal, useConfirmModal } from "@/components/ui/confirm-modal";
import { useRagResources } from "@/lib/features/rag/hooks/use-rag-resources";

interface RAGResourcesProps {
  initialResources: Array<{ title: string; url: string | null }>;
  initialHasMore: boolean;
}

export const RAGResources: React.FC<RAGResourcesProps> = ({
  initialResources,
  initialHasMore,
}) => {
  const { modalProps, triggerModalProps } = useConfirmModal();
  const {
    resources,
    hasMore,
    isFetching,
    isMutating,
    filter,
    setFilter,
    isDeleting,
    loader,
    scrollContainer,
    onDeleteResource,
    onBulkDelete,
  } = useRagResources({
    initialResources,
    initialHasMore,
    itemsPerPage: 20,
  });

  const hasFilter = filter.trim().length > 0;

  return (
    <div className="w-full pb-6">
      <div className="flex flex-col lg:flex-row gap-4 mb-8 items-center">
        <div className="relative flex-1 w-full">
          <Input
            className="pl-10"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter resources..."
          />
          <SearchIcon className="absolute top-1/2 left-3 w-4 h-4 transform -translate-y-1/2 text-muted-foreground" />
        </div>
        <Button
          className="flex-1 w-full"
          variant="destructive"
          disabled={isMutating}
          {...triggerModalProps()}
        >
          Delete {hasFilter ? "Selection" : "All"}
        </Button>
      </div>
      <ConfirmModal
        {...modalProps()}
        onConfirm={onBulkDelete}
        isLoading={isMutating}
        title={
          hasFilter
            ? "Delete Selected Resources"
            : "Delete All Resources"
        }
        message={
          hasFilter
            ? "Are you sure you want to delete the selected resources? This action cannot be undone."
            : "Are you sure you want to delete all resources? This action cannot be undone."
        }
      />
      <ul
        ref={scrollContainer}
        className="space-y-3 max-h-[70dvh] overflow-auto scrollbar-none"
      >
        {resources.map((resource) => (
          <RagResourceItem
            key={resource.title}
            resource={resource}
            isDeleting={isDeleting(resource.title)}
            onDelete={onDeleteResource}
          />
        ))}
        {hasMore && (
          <li
            ref={loader}
            className="h-8 w-full flex items-center justify-center text-muted-foreground text-sm"
          >
            {isFetching ? "Loading more..." : ""}
          </li>
        )}
      </ul>
    </div>
  );
};
