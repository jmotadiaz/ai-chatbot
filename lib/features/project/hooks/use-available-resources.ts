"use client";

import { useState, useCallback, useEffect, useTransition, useRef } from "react";
import { useDebounce } from "use-debounce";
import { type UIResource as Resource } from "@/lib/features/rag/types";
import { getUserResourcesNotInProjectAction } from "@/lib/features/rag/actions";
import { useInfiniteScroll } from "@/lib/utils/hooks/use-infinite-scroll";

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
  getAvailableItemProps: (index: number) => {
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
  const offsetRef = useRef(initialResources.length);
  const [searchFilter, setSearchFilter] = useState("");
  const [isLoading, startTransition] = useTransition();
  const [debouncedFilter] = useDebounce(searchFilter, 300);

  const hasMountedRef = useRef(false);

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
      offsetRef.current = resources.length;
      setHasMore(newHasMore);
    });
  }, [debouncedFilter, projectId]);

  // Load MORE pages (infinite scroll only)
  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || !projectId) return;

    startTransition(async () => {
      const { resources, hasMore: newHasMore } =
        await getUserResourcesNotInProjectAction({
          projectId,
          limit: ITEMS_PER_PAGE,
          offset: offsetRef.current,
          filter: debouncedFilter || undefined,
        });
      setAvailableResources((current) => [...current, ...resources]);
      setHasMore(newHasMore);
      offsetRef.current += resources.length;
    });
  }, [projectId, hasMore, isLoading, debouncedFilter]);

  const { scrollContainer, getItemProps } = useInfiniteScroll({
    items: availableResources,
    hasMore,
    itemsPerPage: ITEMS_PER_PAGE,
    onLoadMore: loadMore,
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
