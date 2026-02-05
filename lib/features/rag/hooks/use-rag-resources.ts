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
import {
  InfiniteScrollAction,
  useInfiniteScroll,
} from "@/lib/utils/hooks/use-infinite-scroll";

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
  const [isMutating, startMutateTransition] = useTransition();
  const [filter, setFilter] = useState<string>("");
  const [debouncedFilter] = useDebounce(filter, 300);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Wrap server action in useCallback with filter dependency
  const loadAction = useCallback<InfiniteScrollAction<UIResource>>(
    async ({ limit, offset }) => {
      return getRagResourcesAction({ limit, offset, filter: debouncedFilter });
    },
    [debouncedFilter],
  );

  const {
    items: resources,
    setItems: setResources,
    hasMore,
    isFetching,
    refresh,
    scrollContainer,
    getItemProps,
  } = useInfiniteScroll<UIResource>({
    loadAction,
    itemsPerPage,
    initialItems: initialResources,
    initialHasMore,
  });

  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      if (debouncedFilter.trim() === "") return;
    }

    refresh();
  }, [debouncedFilter, refresh]);

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
    [startMutateTransition, setResources],
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
  }, [debouncedFilter, startMutateTransition, setResources]);

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
