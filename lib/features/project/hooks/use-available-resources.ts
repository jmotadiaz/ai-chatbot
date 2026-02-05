"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useDebounce } from "use-debounce";
import { type UIResource as Resource } from "@/lib/features/rag/types";
import { getUserResourcesNotInProjectAction } from "@/lib/features/rag/actions";
import {
  InfiniteScrollAction,
  useInfiniteScroll,
} from "@/lib/utils/hooks/use-infinite-scroll";

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
  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedFilter] = useDebounce(searchFilter, 300);

  // Wrap server action in useCallback with projectId and filter dependencies
  const loadAction = useCallback<InfiniteScrollAction<Resource>>(
    async ({ limit, offset }) => {
      return getUserResourcesNotInProjectAction({
        projectId,
        limit,
        offset,
        filter: debouncedFilter || undefined,
      });
    },
    [projectId, debouncedFilter],
  );

  const {
    items: availableResources,
    setItems: setAvailableResources,
    hasMore,
    isFetching: isLoading,
    refresh,
    scrollContainer,
    getItemProps,
  } = useInfiniteScroll<Resource>({
    loadAction,
    itemsPerPage: ITEMS_PER_PAGE,
    initialItems: initialResources,
    initialHasMore,
  });

  const hasMountedRef = useRef(false);

  // Load filtered results when search changes
  useEffect(() => {
    if (!projectId) return;

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      if (debouncedFilter.trim() === "") return;
    }

    refresh();
  }, [debouncedFilter, projectId, refresh]);

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
