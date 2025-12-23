"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";

import {
  deleteAllResources,
  deleteResource,
  deleteResourcesByFilter,
  getRagResourcesAction,
} from "@/lib/features/rag/actions";
import { useIntersectionObserver } from "@/lib/utils/hooks/intersection";

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
  isLoading: boolean;
  filter: string;
  setFilter: (value: string) => void;
  onDeleteResource: (title: string) => void;
  onBulkDelete: () => void;
  scrollContainer: React.RefObject<HTMLUListElement | null>;
  loader: React.RefCallback<HTMLLIElement>;
}

export const useRagResources = ({
  initialResources,
  initialHasMore,
  itemsPerPage = 20,
}: UseRagResourcesParams): UseRagResourcesReturn => {
  const [resources, setResources] =
    useState<RagResourceListItem[]>(initialResources);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [isLoading, startTransition] = useTransition();
  const [filter, setFilter] = useState<string>("");
  const [debouncedFilter] = useDebounce(filter, 300);

  const resourcesRef = useRef<RagResourceListItem[]>(initialResources);
  useEffect(() => {
    resourcesRef.current = resources;
  }, [resources]);

  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      // Avoid duplicate fetch on mount; server already provided initial data.
      if (debouncedFilter.trim() === "") return;
    }

    startTransition(async () => {
      const result = await getRagResourcesAction({
        limit: itemsPerPage,
        offset: 0,
        filter: debouncedFilter,
      });

      setResources(result.resources);
      setHasMore(result.hasMore);
    });
  }, [debouncedFilter, itemsPerPage, startTransition]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading) return;

    const offset = resourcesRef.current.length;
    startTransition(async () => {
      const result = await getRagResourcesAction({
        limit: itemsPerPage,
        offset,
        filter: debouncedFilter,
      });

      setResources((prev) => [...prev, ...result.resources]);
      setHasMore(result.hasMore);
    });
  }, [debouncedFilter, hasMore, isLoading, itemsPerPage, startTransition]);

  const { loader, scrollContainer } = useIntersectionObserver<
    HTMLUListElement,
    HTMLLIElement
  >({
    onIntersect: loadMore,
  });

  const onDeleteResource = useCallback(
    (title: string) => {
      startTransition(async () => {
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
        }
      });
    },
    [startTransition]
  );

  const onBulkDelete = useCallback(() => {
    startTransition(async () => {
      try {
        const trimmed = debouncedFilter.trim();
        if (trimmed.length > 0) {
          const result = await deleteResourcesByFilter(trimmed);
          if (result.success) {
            setResources([]);
            setHasMore(false);
            toast.success("Selected resources deleted successfully");
          } else {
            toast.error(result.error || "Failed to delete selected resources");
          }
          return;
        }

        const result = await deleteAllResources();
        if (result.success) {
          setResources([]);
          setHasMore(false);
          toast.success("All resources deleted successfully");
        } else {
          toast.error(result.error || "Failed to delete all resources");
        }
      } catch (error) {
        console.error("Error deleting resources:", error);
        toast.error("An error occurred while deleting resources");
      }
    });
  }, [debouncedFilter, startTransition]);

  return useMemo(
    () => ({
      resources,
      hasMore,
      isLoading,
      filter,
      setFilter,
      onDeleteResource,
      onBulkDelete,
      scrollContainer,
      loader,
    }),
    [resources, hasMore, isLoading, filter, onDeleteResource, onBulkDelete, scrollContainer, loader]
  );
};


