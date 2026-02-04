"use client";

import { useState, useCallback, useEffect } from "react";
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
  const [isLoadingState, setIsLoadingState] = useState(false);
  const [debouncedFilter] = useDebounce(searchFilter, 300);
  // Sync with server data ONLY when projectId changes to avoid resetting infinite scroll state on revalidation
  useEffect(() => {
    setAvailableResources(initialResources);
    setHasMore(initialHasMore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Load filtered results when search changes
  useEffect(() => {
    if (!projectId) return;

    const loadFiltered = async () => {
      setIsLoadingState(true);
      try {
        const { resources, hasMore: newHasMore } =
          await getUserResourcesNotInProjectAction({
            projectId,
            limit: ITEMS_PER_PAGE,
            offset: 0,
            filter: debouncedFilter || undefined,
          });
        setAvailableResources(resources);
        setHasMore(newHasMore);
      } finally {
        setIsLoadingState(false);
      }
    };

    loadFiltered();
  }, [debouncedFilter, projectId]);

  // Load MORE pages (infinite scroll only)
  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingState || !projectId) return;

    setIsLoadingState(true);
    getUserResourcesNotInProjectAction({
      projectId,
      limit: ITEMS_PER_PAGE,
      offset: availableResources.length,
      filter: debouncedFilter || undefined,
    })
      .then(({ resources, hasMore: newHasMore }) => {
        setAvailableResources((prev) => [...prev, ...resources]);
        setHasMore(newHasMore);
      })
      .finally(() => {
        setIsLoadingState(false);
      });
  }, [
    projectId,
    hasMore,
    isLoadingState,
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
    isLoading: isLoadingState,
    scrollContainer,
    getAvailableItemProps: getItemProps,
  };
};
