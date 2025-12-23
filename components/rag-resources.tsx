"use client";

import { SearchIcon, Trash2 } from "lucide-react";
import { RagResourceItem } from "./rag-resource-item";
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
    isLoading,
    filter,
    setFilter,
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
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          disabled={isLoading}
          {...triggerModalProps()}
          aria-label={hasFilter ? "Delete selection" : "Delete all"}
        >
          <Trash2 className="w-5 h-5" />
          <span className="sr-only">
            Delete {hasFilter ? "Selection" : "All"}
          </span>
        </Button>
      </div>
      <ConfirmModal
        {...modalProps()}
        onConfirm={onBulkDelete}
        isLoading={isLoading}
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
            isLoading={isLoading}
            onDelete={onDeleteResource}
          />
        ))}
        {hasMore && (
          <li
            ref={loader}
            className="h-8 w-full flex items-center justify-center text-muted-foreground text-sm"
          >
            {isLoading ? "Loading more..." : ""}
          </li>
        )}
      </ul>
    </div>
  );
};
