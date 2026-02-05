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
import { type UIResource } from "@/lib/features/rag/types";
import { useInfiniteScroll } from "@/lib/utils/hooks/use-infinite-scroll";

export interface UseRagResourcesParams {
  initialResources: UIResource[];
  initialHasMore: boolean;
  itemsPerPage?: number;
}

export interface UseRagResourcesReturn {
  resources: UIResource[];
  hasMore: boolean;
  isFetching: boolean;
  isMutating: boolean;
  filter: string;
  setFilter: (value: string) => void;
  onBulkDelete: () => void;
  scrollContainer: React.RefObject<HTMLUListElement | null>;
  getResourceItemProps: ({
    resource,
    index,
  }: {
    resource: UIResource;
    index: number;
  }) => {
    loaderRef?: React.RefCallback<HTMLLIElement>;
    resource: UIResource;
    isDeleting?: boolean;
    onDelete?: (item: UIResource) => void;
  };
}

export const useRagResources = ({
  initialResources,
  initialHasMore,
  itemsPerPage = 20,
}: UseRagResourcesParams): UseRagResourcesReturn => {
  const [resources, setResources] = useState<UIResource[]>(initialResources);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [isFetching, startFetchTransition] = useTransition();
  const [isMutating, startMutateTransition] = useTransition();
  const [filter, setFilter] = useState<string>("");
  const [debouncedFilter] = useDebounce(filter, 300);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const offsetRef = useRef(initialResources.length);

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
      offsetRef.current = result.resources.length;
    });
  }, [debouncedFilter, itemsPerPage]);

  // Load more items for infinite scroll
  const loadMore = useCallback(() => {
    if (!hasMore || isFetching) return;

    startFetchTransition(async () => {
      const result = await getRagResourcesAction({
        limit: itemsPerPage,
        offset: offsetRef.current,
        filter: debouncedFilter,
      });

      setResources((current) => [...current, ...result.resources]);
      setHasMore(result.hasMore);
      offsetRef.current += result.resources.length;
    });
  }, [debouncedFilter, hasMore, isFetching, itemsPerPage]);

  const onDeleteResource = useCallback(
    (resource: UIResource) => {
      setDeletingIds((prev) => new Set(prev).add(resource.id));
      startMutateTransition(async () => {
        try {
          const result = await deleteResource(resource.id);
          if (result.success) {
            setResources((prev) => prev.filter((r) => r.id !== resource.id));
            toast.success(`Resource "${resource.title}" deleted successfully`);
          } else {
            toast.error(result.error || "Failed to delete resource");
          }
        } catch (error) {
          console.error("Error deleting resource:", error);
          toast.error("An error occurred while deleting the resource");
        } finally {
          setDeletingIds((prev) => {
            const next = new Set(prev);
            next.delete(resource.id);
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

  const { scrollContainer, getItemProps } = useInfiniteScroll({
    items: resources,
    hasMore,
    itemsPerPage,
    onLoadMore: loadMore,
  });

  const getResourceItemProps = useCallback(
    ({ resource, index }: { resource: UIResource; index: number }) => {
      const { loaderRef } = getItemProps(index);
      return {
        resource,
        loaderRef,
        isDeleting: deletingIds.has(resource.id),
        onDelete: onDeleteResource,
      };
    },
    [getItemProps, onDeleteResource, deletingIds],
  );

  return {
    resources,
    hasMore,
    isFetching,
    isMutating,
    filter,
    setFilter,
    onBulkDelete,
    scrollContainer,
    getResourceItemProps,
  };
};
