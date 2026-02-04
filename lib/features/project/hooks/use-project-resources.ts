"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { getProjectResourcesAction } from "@/lib/features/rag/actions";
import { useInfiniteScrollItems } from "@/lib/utils/hooks/use-infinite-scroll-items";

export interface Resource {
  id: string;
  title: string;
  url: string | null;
}

interface UseProjectResourcesParams {
  projectId: string;
  initialResources?: Resource[];
  initialHasMore?: boolean;
}

interface UseProjectResourcesReturn {
  projectResources: Resource[];
  setProjectResources: React.Dispatch<React.SetStateAction<Resource[]>>;
  hasMore: boolean;
  isLoading: boolean;
  scrollContainer: React.RefObject<HTMLUListElement | null>;
  getProjectItemProps: (
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

export const useProjectResources = ({
  projectId,
  initialResources = [],
  initialHasMore = false,
}: UseProjectResourcesParams): UseProjectResourcesReturn => {
  // Initialize with server data
  const [projectResources, setProjectResources] =
    useState<Resource[]>(initialResources);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, startTransition] = useTransition();
  // Sync with server data ONLY when projectId changes to avoid resetting infinite scroll state on revalidation
  // Note: initialResources/initialHasMore are intentionally excluded - we only reset on project change,
  // not when parent re-renders with same data (which would reset scroll position)
  useEffect(() => {
    setProjectResources(initialResources);
    setHasMore(initialHasMore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Load MORE pages (infinite scroll only)
  // Uses functional setState to append without stale closure issues
  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || !projectId) return;

    startTransition(async () => {
      const result = await getProjectResourcesAction({
        projectId,
        limit: ITEMS_PER_PAGE,
        offset: projectResources.length,
      });

      setProjectResources((current) => [...current, ...result.resources]);
      setHasMore(result.hasMore);
    });
  }, [hasMore, isLoading, projectId, projectResources.length]);

  const { scrollContainer, getItemProps } = useInfiniteScrollItems({
    items: projectResources,
    hasMore,
    itemsPerPage: ITEMS_PER_PAGE,
    onLoadMore: loadMore,
    getItemKey: (resource) => resource.id,
  });

  return {
    projectResources,
    setProjectResources,
    hasMore,
    isLoading,
    scrollContainer,
    getProjectItemProps: getItemProps,
  };
};
