import { useCallback } from "react";
import { getProjectResourcesAction } from "@/lib/features/rag/actions";
import { type UIResource } from "@/lib/features/rag/types";
import {
  InfiniteScrollAction,
  useInfiniteScroll,
} from "@/lib/utils/hooks/use-infinite-scroll";

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
  // Wrap server action in useCallback with projectId dependency
  const loadAction = useCallback<InfiniteScrollAction<Resource>>(
    async ({ limit, offset }) => {
      return getProjectResourcesAction({ projectId, limit, offset });
    },
    [projectId],
  );

  const {
    items: projectResources,
    setItems: setProjectResources,
    hasMore,
    isFetching: isLoading,
    scrollContainer,
    getItemProps,
  } = useInfiniteScroll<Resource>({
    loadAction,
    itemsPerPage: ITEMS_PER_PAGE,
    initialItems: initialResources,
    initialHasMore,
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
