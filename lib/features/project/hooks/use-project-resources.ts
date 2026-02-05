import { useState, useCallback, useTransition, useRef } from "react";
import { getProjectResourcesAction } from "@/lib/features/rag/actions";
import { type UIResource } from "@/lib/features/rag/types";
import { useInfiniteScroll } from "@/lib/utils/hooks/use-infinite-scroll";

export type Resource = UIResource;

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
  getProjectItemProps: (index: number) => {
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
  const offsetRef = useRef(initialResources.length);
  const [isLoading, startTransition] = useTransition();

  // Load MORE pages (infinite scroll only)
  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || !projectId) return;

    startTransition(async () => {
      const result = await getProjectResourcesAction({
        projectId,
        limit: ITEMS_PER_PAGE,
        offset: offsetRef.current,
      });

      setProjectResources((current) => [...current, ...result.resources]);
      setHasMore(result.hasMore);
      offsetRef.current += result.resources.length;
    });
  }, [hasMore, isLoading, projectId]);

  const { scrollContainer, getItemProps } = useInfiniteScroll({
    items: projectResources,
    hasMore,
    itemsPerPage: ITEMS_PER_PAGE,
    onLoadMore: loadMore,
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
