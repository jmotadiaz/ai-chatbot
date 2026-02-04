"use client";

import { useState, useCallback, useEffect, useTransition, useRef } from "react";
import { useDebounce } from "use-debounce";
import type { Resource } from "./use-project-resources";
import { getUserResourcesNotInProjectAction } from "@/lib/features/rag/actions";
import { useInfiniteScrollItems } from "@/lib/utils/hooks/use-infinite-scroll-items";

interface UseAvailableResourcesParams {
  projectId: string;
  initialResources?: Resource[];
  initialHasMore?: boolean;
}

interface UseAvailableResourcesReturn {
  availableResources: Resource[];
  setAvailableResources: React.Dispatch<React.SetStateAction<Resource[]>>;
  searchFilter: string;
  setSearchFilter: React.Dispatch<React.SetStateAction<string>>;
  hasMore: boolean;
  isLoading: boolean;
  scrollContainer: React.RefObject<HTMLUListElement | null>;
  getAvailableItemProps: (
    resource: Resource,
    index: number,
  ) => {
    item: Resource;
    isDeleting?: boolean;
    onDelete?: (item: Resource) => void;
    loaderRef?: React.RefCallback<HTMLLIElement>;
  };
}

const ITEMS_PER_PAGE = 20;

export const useAvailableResources = ({
  projectId,
  initialResources = [],
  initialHasMore = false,
}: UseAvailableResourcesParams): UseAvailableResourcesReturn => {
  // Initialize with server data
  const [availableResources, setAvailableResources] =
    useState<Resource[]>(initialResources);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [searchFilter, setSearchFilter] = useState("");
  const [isLoading, startTransition] = useTransition();
  const [debouncedFilter] = useDebounce(searchFilter, 300);

  const hasMountedRef = useRef(false);

  // Sync with server data ONLY when projectId changes to avoid resetting infinite scroll state on revalidation
  // Note: initialResources/initialHasMore are intentionally excluded - we only reset on project change,
  // not when parent re-renders with same data (which would reset scroll position)
  useEffect(() => {
    setAvailableResources(initialResources);
    setHasMore(initialHasMore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Load filtered results when search changes
  useEffect(() => {
    if (!projectId) return;

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      if (debouncedFilter.trim() === "") return;
    }

    startTransition(async () => {
      const { resources, hasMore: newHasMore } =
        await getUserResourcesNotInProjectAction({
          projectId,
          limit: ITEMS_PER_PAGE,
          offset: 0,
          filter: debouncedFilter || undefined,
        });
      setAvailableResources(resources);
      setHasMore(newHasMore);
    });
  }, [debouncedFilter, projectId]);

  // Load MORE pages (infinite scroll only)
  // Uses functional setState to append without stale closure issues
  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || !projectId) return;

    startTransition(async () => {
      const { resources, hasMore: newHasMore } =
        await getUserResourcesNotInProjectAction({
          projectId,
          limit: ITEMS_PER_PAGE,
          offset: availableResources.length,
          filter: debouncedFilter || undefined,
        });
      setAvailableResources((current) => [...current, ...resources]);
      setHasMore(newHasMore);
    });
  }, [
    projectId,
    hasMore,
    isLoading,
    debouncedFilter,
    availableResources.length,
  ]);

  const { scrollContainer, getItemProps } = useInfiniteScrollItems({
    items: availableResources,
    hasMore,
    itemsPerPage: ITEMS_PER_PAGE,
    onLoadMore: loadMore,
    getItemKey: (resource) => resource.id,
  });

  return {
    availableResources,
    setAvailableResources,
    searchFilter,
    setSearchFilter,
    hasMore,
    isLoading,
    scrollContainer,
    getAvailableItemProps: getItemProps,
  };
};
