"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";

import {
  deleteAllResources,
  deleteResource,
  deleteResourcesByFilter,
  getRagResourcesAction,
} from "@/lib/features/rag/actions";
import { useInfiniteScrollItems } from "@/lib/utils/hooks/use-infinite-scroll-items";

export interface RagResourceListItem {
  title: string;
  url: string | null;
}

export interface UseRagResourcesParams {
  initialResources: RagResourceListItem[];
  initialHasMore: boolean;
  itemsPerPage?: number;
}

export interface UseRagResourcesReturn {
  resources: RagResourceListItem[];
  hasMore: boolean;
  isFetching: boolean;
  isMutating: boolean;
  filter: string;
  setFilter: (value: string) => void;
  onBulkDelete: () => void;
  scrollContainer: React.RefObject<HTMLUListElement | null>;
  getResourceItemProps: (
    resource: RagResourceListItem,
    index: number,
  ) => {
    item: RagResourceListItem;
    isDeleting?: boolean;
    onDelete?: (item: RagResourceListItem) => void;
    loaderRef?: React.RefCallback<HTMLLIElement>;
  };
}

export const useRagResources = ({
  initialResources,
  initialHasMore,
  itemsPerPage = 20,
}: UseRagResourcesParams): UseRagResourcesReturn => {
  const [resources, setResources] =
    useState<RagResourceListItem[]>(initialResources);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [isFetching, startFetchTransition] = useTransition();
  const [isMutating, startMutateTransition] = useTransition();
  const [filter, setFilter] = useState<string>("");
  const [debouncedFilter] = useDebounce(filter, 300);
  const [deletingTitles, setDeletingTitles] = useState<Set<string>>(new Set());

  // Removed resourcesCountRef in favor of direct state dependency

  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      if (debouncedFilter.trim() === "") return;
    }

    startFetchTransition(async () => {
      const result = await getRagResourcesAction({
        limit: itemsPerPage,
        offset: 0,
        filter: debouncedFilter,
      });

      setResources(result.resources);
      setHasMore(result.hasMore);
    });
  }, [debouncedFilter, itemsPerPage]);

  // Load more items for infinite scroll
  // Uses functional setState to append without stale closure issues
  const loadMore = useCallback(() => {
    if (!hasMore || isFetching) return;

    startFetchTransition(async () => {
      const result = await getRagResourcesAction({
        limit: itemsPerPage,
        offset: resources.length,
        filter: debouncedFilter,
      });

      setResources((current) => [...current, ...result.resources]);
      setHasMore(result.hasMore);
    });
  }, [debouncedFilter, hasMore, isFetching, itemsPerPage, resources.length]);

  const onDeleteResource = useCallback(
    (title: string) => {
      setDeletingTitles((prev) => new Set(prev).add(title));
      startMutateTransition(async () => {
        try {
          const result = await deleteResource(title);
          if (result.success) {
            setResources((prev) => prev.filter((r) => r.title !== title));
            toast.success(`Resource "${title}" deleted successfully`);
          } else {
            toast.error(result.error || "Failed to delete resource");
          }
        } catch (error) {
          console.error("Error deleting resource:", error);
          toast.error("An error occurred while deleting the resource");
        } finally {
          setDeletingTitles((prev) => {
            const next = new Set(prev);
            next.delete(title);
            return next;
          });
        }
      });
    },
    [startMutateTransition],
  );

  const onBulkDelete = useCallback(() => {
    startMutateTransition(async () => {
      try {
        const trimmed = debouncedFilter.trim();
        const result =
          trimmed.length > 0
            ? await deleteResourcesByFilter(trimmed)
            : await deleteAllResources();

        if (result.success) {
          setResources([]);
          setHasMore(false);
          toast.success(
            trimmed
              ? "Selected resources deleted successfully"
              : "All resources deleted successfully",
          );
        } else {
          toast.error(result.error || "Failed to delete resources");
        }
      } catch (error) {
        console.error("Error deleting resources:", error);
        toast.error("An error occurred while deleting resources");
      }
    });
  }, [debouncedFilter, startMutateTransition]);

  const { scrollContainer, getItemProps } = useInfiniteScrollItems({
    items: resources,
    hasMore,
    itemsPerPage,
    onLoadMore: loadMore,
    getItemKey: (resource) => resource.title,
    getItemDeletingState: (resource) => deletingTitles.has(resource.title),
    onItemDelete: (resource) => onDeleteResource(resource.title),
  });

  return {
    resources,
    hasMore,
    isFetching,
    isMutating,
    filter,
    setFilter,
    onBulkDelete,
    scrollContainer,
    getResourceItemProps: getItemProps,
  };
};
